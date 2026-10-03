-- Nusantara Star — atomic reservation-backed booking security V1 (DRAFT)
-- Apply only during the coordinated reservation cutover, after
-- supabase-payment-request-cutoff-v1.sql. This migration has not been applied.

begin;

alter table public.bookings
  add column if not exists financial_security_recorded_by text null,
  add column if not exists financial_security_recorded_at timestamptz null;

alter table public.cancellation_cases
  add column if not exists reservation_released_at timestamptz null,
  add column if not exists reservation_released_by text null,
  add column if not exists reservation_release_note text null;

alter table public.cancellation_cases drop constraint if exists cancellation_cases_reservation_release_audit_check;
alter table public.cancellation_cases add constraint cancellation_cases_reservation_release_audit_check check (
  (reservation_released_at is null and reservation_released_by is null and reservation_release_note is null)
  or (
    reservation_released_at is not null
    and length(trim(coalesce(reservation_released_by,''))) between 3 and 200
    and length(trim(coalesce(reservation_release_note,''))) >= 10
  )
) not valid;

alter table public.bookings drop constraint if exists bookings_manual_security_audit_check;
alter table public.bookings add constraint bookings_manual_security_audit_check check (
  financial_security_type not in ('approved_po_credit','authorized_exception')
  or financial_security_status <> 'satisfied'
  or (
    length(trim(coalesce(financial_security_reference,''))) >= 3
    and length(trim(coalesce(financial_security_recorded_by,''))) between 3 and 200
    and financial_security_recorded_at is not null
  )
) not valid;

create table if not exists public.ns_booking_transition_authorizations (
  transaction_id bigint not null,
  booking_id uuid not null,
  action text not null check (action in ('create_booking','record_manual_security','secure_booking')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (transaction_id, booking_id, action)
);
revoke all on table public.ns_booking_transition_authorizations
  from public, anon, authenticated, service_role;
alter table public.ns_booking_transition_authorizations enable row level security;
alter table public.ns_booking_transition_authorizations drop constraint if exists ns_booking_transition_authorizations_action_check;
alter table public.ns_booking_transition_authorizations add constraint ns_booking_transition_authorizations_action_check
  check (action in ('create_booking','record_manual_security','secure_booking','finalize_cancellation','abandon_pending','expire_hold'));

alter table public.ns_payment_transition_authorizations
  drop constraint if exists ns_payment_transition_authorizations_action_check;
alter table public.ns_payment_transition_authorizations
  add constraint ns_payment_transition_authorizations_action_check
  check (action in ('create_request','record_evidence','accept_late','cancel_request'));

alter table public.payments drop constraint if exists payments_late_reconciliation_shape_check;
alter table public.payments add constraint payments_late_reconciliation_shape_check check (
  (receipt_timing is null and reconciliation_status is null and reconciliation_note is null
    and reconciled_at is null and reconciled_by is null)
  or (receipt_timing = 'on_time' and reconciliation_status is null and reconciliation_note is null
    and reconciled_at is null and reconciled_by is null)
  or (receipt_timing = 'late' and reconciliation_status = 'pending'
    and reconciliation_note is null and reconciled_at is null and reconciled_by is null
    and coalesce(trim(provider),'') <> '' and coalesce(trim(provider_reference),'') <> ''
    and coalesce(trim(evidence_key),'') <> '' and paid_at is not null and status = 'pending')
  or (receipt_timing = 'late' and reconciliation_status = 'accepted' and status = 'paid'
    and length(trim(coalesce(reconciliation_note,''))) >= 10
    and reconciled_at is not null and length(trim(coalesce(reconciled_by,''))) between 3 and 200)
  or (receipt_timing = 'late' and reconciliation_status = 'rejected'
    and status in ('pending','refunded','cancelled')
    and length(trim(coalesce(reconciliation_note,''))) >= 10
    and reconciled_at is not null and length(trim(coalesce(reconciled_by,''))) between 3 and 200)
) not valid;

create table if not exists public.booking_pre_security_abandonments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  deal_id uuid not null references public.deals(id) on delete restrict,
  booking_schedule_reservation_id uuid not null unique
    references public.booking_schedule_reservations(id) on delete restrict,
  buyer_terms_were_accepted boolean not null,
  revoked_payment_request_ids uuid[] not null default '{}'::uuid[],
  abandoned_by text not null,
  reason text not null,
  abandoned_at timestamptz not null default clock_timestamp(),
  constraint booking_pre_security_abandonment_audit_check check (
    length(trim(abandoned_by)) between 3 and 200
    and length(trim(reason)) >= 10
  )
);
alter table public.booking_pre_security_abandonments enable row level security;
revoke all on table public.booking_pre_security_abandonments
  from public, anon, authenticated, service_role;

create or replace function public.ns_protect_booking_pre_security_abandonment_v1()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'Pre-security abandonment audit is immutable'; end; $$;
drop trigger if exists trg_protect_booking_pre_security_abandonment_v1
  on public.booking_pre_security_abandonments;
create trigger trg_protect_booking_pre_security_abandonment_v1
before update or delete on public.booking_pre_security_abandonments
for each row execute function public.ns_protect_booking_pre_security_abandonment_v1();

create table if not exists public.booking_manual_security_approvals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  deal_id uuid not null references public.deals(id) on delete restrict,
  booking_schedule_reservation_id uuid not null
    references public.booking_schedule_reservations(id) on delete restrict,
  security_type text not null check (security_type in ('approved_po_credit','authorized_exception')),
  reference text not null,
  approved_amount bigint not null check (approved_amount >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  evidence_snapshot jsonb not null,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_manual_security_approval_evidence_check check (
    length(trim(reference)) >= 3
    and jsonb_typeof(evidence_snapshot) = 'object'
    and length(trim(coalesce(evidence_snapshot ->> 'note',''))) >= 10
    and length(trim(approved_by)) between 3 and 200
    and valid_until > approved_at
    and (
      (security_type = 'approved_po_credit' and approved_amount > 0)
      or security_type = 'authorized_exception'
    )
  )
);
create index if not exists idx_booking_manual_security_approvals_booking
  on public.booking_manual_security_approvals(booking_id, approved_at desc);
create unique index if not exists idx_booking_manual_security_approval_idempotency
  on public.booking_manual_security_approvals(
    booking_id, booking_schedule_reservation_id, security_type, reference
  );
alter table public.booking_manual_security_approvals enable row level security;
revoke all on table public.booking_manual_security_approvals
  from public, anon, authenticated, service_role;

create or replace function public.ns_protect_booking_manual_security_approval_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Manual booking security approvals are immutable';
end;
$$;
drop trigger if exists trg_protect_booking_manual_security_approval_v1
  on public.booking_manual_security_approvals;
create trigger trg_protect_booking_manual_security_approval_v1
before update or delete on public.booking_manual_security_approvals
for each row execute function public.ns_protect_booking_manual_security_approval_v1();

create or replace function public.ns_guard_booking_reservation_security_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.booking_schedule_reservations%rowtype;
  v_entering_secured boolean;
  v_financial_evidence_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_entering_secured := new.status = 'secured';
    v_financial_evidence_changed := new.financial_security_status = 'satisfied'
      or new.financial_security_type is not null
      or new.financial_security_reference is not null
      or new.financial_security_recorded_by is not null
      or new.financial_security_recorded_at is not null
      or new.secured_at is not null;
  else
    v_entering_secured := new.status = 'secured' and old.status is distinct from 'secured';
    v_financial_evidence_changed :=
      new.financial_security_type is distinct from old.financial_security_type
      or new.financial_security_status is distinct from old.financial_security_status
      or new.financial_security_reference is distinct from old.financial_security_reference
      or new.financial_security_recorded_by is distinct from old.financial_security_recorded_by
      or new.financial_security_recorded_at is distinct from old.financial_security_recorded_at
      or new.secured_at is distinct from old.secured_at;
  end if;

  if v_financial_evidence_changed and not exists (
    select 1 from public.ns_booking_transition_authorizations a
    where a.transaction_id = txid_current() and a.booking_id = new.id
      and a.action in ('record_manual_security','secure_booking')
  ) then
    raise exception 'Booking financial security must use an authorized RPC';
  end if;

  if v_entering_secured and not exists (
    select 1 from public.ns_booking_transition_authorizations a
    where a.transaction_id = txid_current() and a.booking_id = new.id
      and a.action = 'secure_booking'
  ) then
    raise exception 'Booking secured transition must use the atomic reservation RPC';
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and not exists (
       select 1 from public.ns_booking_transition_authorizations a
       where a.transaction_id = txid_current() and a.booking_id = new.id
         and a.action in ('finalize_cancellation','abandon_pending')
     ) then
    raise exception 'Booking cancellation must use the atomic cancellation finalization RPC';
  end if;

  if new.status in ('secured','pre_show','incident','completed') then
    select * into r from public.booking_schedule_reservations
    where booking_id = new.id and status = 'secured';
    if not found or r.deal_id is distinct from new.deal_id or r.talent_id is distinct from new.talent_id then
      raise exception 'Secured booking lifecycle requires the exact secured duty reservation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_booking_reservation_security_v1 on public.bookings;
create trigger trg_booking_reservation_security_v1
before insert or update on public.bookings
for each row execute function public.ns_guard_booking_reservation_security_v1();

create or replace function public.ns_guard_brief_booked_reservation_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  r public.booking_schedule_reservations%rowtype;
  v_entering_booked boolean;
  v_entering_cancelled boolean;
begin
  if tg_op = 'INSERT' then
    v_entering_booked := new.status = 'booked';
    v_entering_cancelled := new.status = 'cancelled';
  else
    v_entering_booked := new.status = 'booked' and old.status is distinct from 'booked';
    v_entering_cancelled := new.status = 'cancelled' and old.status is distinct from 'cancelled';
  end if;

  if v_entering_cancelled then
    if not exists (
      select 1 from public.ns_booking_transition_authorizations a
      join public.bookings b0 on b0.id = a.booking_id
      where a.transaction_id = txid_current() and a.action in ('finalize_cancellation','abandon_pending')
        and b0.brief_id = new.id and b0.status = 'cancelled'
    ) then
      raise exception 'Brief cancellation must use the atomic cancellation finalization RPC';
    end if;
    return new;
  end if;
  if not v_entering_booked then return new; end if;

  select b0.* into b
  from public.ns_booking_transition_authorizations a
  join public.bookings b0 on b0.id = a.booking_id
  where a.transaction_id = txid_current() and a.action = 'secure_booking'
    and b0.brief_id = new.id and b0.status = 'secured';
  if not found then
    raise exception 'Brief booked transition must use the atomic secured-booking RPC';
  end if;
  select * into r from public.booking_schedule_reservations
  where booking_id = b.id and deal_id = b.deal_id and status = 'secured';
  if not found then
    raise exception 'Booked brief requires the exact secured duty reservation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_brief_booked_reservation_v1 on public.briefs;
create trigger trg_brief_booked_reservation_v1
before insert or update on public.briefs
for each row execute function public.ns_guard_brief_booked_reservation_v1();

create or replace function public.ns_record_manual_booking_security_v1(
  p_booking_id uuid,
  p_security_type text,
  p_reference text,
  p_approved_amount bigint,
  p_evidence_note text,
  p_recorded_by text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  o public.talent_offers%rowtype;
  r public.booking_schedule_reservations%rowtype;
  m public.payment_milestones%rowtype;
  a public.booking_manual_security_approvals%rowtype;
  v_reference text := trim(coalesce(p_reference,''));
  v_evidence_note text := trim(coalesce(p_evidence_note,''));
  v_recorded_by text := trim(coalesce(p_recorded_by,''));
  v_required numeric := 0;
  v_now timestamptz := now();
begin
  if p_security_type not in ('approved_po_credit','authorized_exception') then
    raise exception 'Unsupported manual financial security type';
  end if;
  if length(v_reference) < 3 then raise exception 'Manual financial security reference is required'; end if;
  if length(v_evidence_note) < 10 then raise exception 'Manual security evidence note is required'; end if;
  if length(v_recorded_by) not between 3 and 200 then raise exception 'Manual security recorder identity is required'; end if;
  if p_approved_amount is null or p_approved_amount < 0 then raise exception 'Approved amount is invalid'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending_security' or b.deal_id is null then
    raise exception 'Booking is not awaiting financial security';
  end if;
  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id
     or d.buyer_terms_status <> 'accepted' or d.talent_terms_status <> 'confirmed'
     or d.funding_gap_status <> 'safe' then
    raise exception 'Locked deal is not ready for manual booking security';
  end if;
  if b.buyer_terms_accepted_at is null or b.buyer_terms_accepted_deal_id <> d.id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or b.buyer_terms_snapshot is null
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Exact buyer terms snapshot must be accepted before manual security';
  end if;
  if cardinality(coalesce(d.unresolved_issues,'{}'::text[])) > 0 and d.exception_status <> 'approved' then
    raise exception 'Deal has unresolved issues without an approved exception';
  end if;
  if p_security_type = 'authorized_exception' and d.exception_status <> 'approved' then
    raise exception 'Commercial exception is not approved';
  end if;

  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'), hashtext(d.talent_id::text));
  select * into r from public.booking_schedule_reservations
  where booking_id = b.id and status = 'held' for update;
  if not found or r.deal_id <> d.id or r.talent_id <> d.talent_id
     or r.talent_offer_id <> d.talent_offer_id or r.hold_expires_at <= v_now
     or r.offer_valid_until <= v_now then
    raise exception 'Manual security requires the exact live held duty reservation';
  end if;
  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if not found or o.status <> 'confirmed' or o.availability_status <> 'confirmed'
     or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id
     or o.quote_valid_until is distinct from r.offer_valid_until
     or o.quote_valid_until <= v_now then
    raise exception 'Talent offer requires reconfirmation before manual security';
  end if;

  select * into m from public.payment_milestones
  where booking_id = b.id and party = 'buyer' order by sequence_no asc limit 1 for update;
  if not found then raise exception 'Buyer payment milestones are missing'; end if;
  if m.calculation_type = 'percentage' then v_required := round(b.buyer_price * (coalesce(m.percentage,0) / 100.0));
  elsif m.calculation_type = 'fixed_amount' then v_required := coalesce(m.amount,0);
  else v_required := b.buyer_price; end if;
  if v_required <= 0 then raise exception 'Initial buyer security amount is invalid'; end if;
  if p_security_type = 'approved_po_credit' and p_approved_amount < v_required then
    raise exception 'Approved PO/credit amount is below the initial booking security requirement';
  end if;

  select * into a from public.booking_manual_security_approvals
  where booking_id = b.id and booking_schedule_reservation_id = r.id
    and security_type = p_security_type and reference = v_reference
  for update;
  if found then
    if a.approved_amount = p_approved_amount
       and a.evidence_snapshot ->> 'note' = v_evidence_note
       and a.approved_by = v_recorded_by then
      return jsonb_build_object(
        'bookingId',b.id,'approvalId',a.id,'securityType',a.security_type,
        'securityStatus','satisfied','reservationId',r.id,'alreadyRecorded',true
      );
    end if;
    raise exception 'Manual security reference already exists with different evidence';
  end if;

  insert into public.booking_manual_security_approvals(
    booking_id,deal_id,booking_schedule_reservation_id,security_type,reference,
    approved_amount,currency,evidence_snapshot,approved_by,approved_at,valid_until
  ) values (
    b.id,d.id,r.id,p_security_type,v_reference,p_approved_amount,'IDR',
    jsonb_build_object('note',v_evidence_note,'source','verified_admin_route'),
    v_recorded_by,v_now,least(r.hold_expires_at,r.offer_valid_until)
  ) returning * into a;

  insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
  values (txid_current(),b.id,'record_manual_security');
  update public.bookings set
    financial_security_type = p_security_type,
    financial_security_status = 'satisfied',
    financial_security_reference = v_reference,
    financial_security_recorded_by = v_recorded_by,
    financial_security_recorded_at = v_now,
    updated_at = v_now
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Booking changed before manual security was recorded'; end if;
  delete from public.ns_booking_transition_authorizations
  where transaction_id = txid_current() and booking_id = b.id and action = 'record_manual_security';

  return jsonb_build_object(
    'bookingId',b.id,'approvalId',a.id,'securityType',p_security_type,
    'securityStatus','satisfied','reservationId',r.id,'approvedAmount',p_approved_amount,
    'recordedAt',v_now,'recordedBy',v_recorded_by,'alreadyRecorded',false
  );
end;
$$;

create or replace function public.ns_secure_booking_v1(p_booking_id uuid)
returns table(booking_status text, financial_security_type text, paid_buyer_total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  br public.briefs%rowtype;
  o public.talent_offers%rowtype;
  r public.booking_schedule_reservations%rowtype;
  m public.payment_milestones%rowtype;
  v_payment public.payments%rowtype;
  a public.booking_manual_security_approvals%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_security_type text;
  v_now timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending_security' or b.deal_id is null then
    raise exception 'Booking is not pending security';
  end if;
  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then
    raise exception 'Booking and locked deal chain do not match';
  end if;
  if b.buyer_price is distinct from d.buyer_price
     or b.talent_payable is distinct from d.talent_payable
     or b.direct_cost is distinct from coalesce(d.direct_costs,0)
     or d.talent_terms_status <> 'confirmed' or d.buyer_terms_status <> 'accepted'
     or d.funding_gap_status <> 'safe' then
    raise exception 'Locked commercial state is not ready for booking security';
  end if;
  if b.buyer_terms_accepted_at is null or b.buyer_terms_accepted_deal_id <> d.id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or b.buyer_terms_snapshot is null
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Exact buyer terms snapshot is not accepted';
  end if;
  if cardinality(coalesce(d.unresolved_issues,'{}'::text[])) > 0 and d.exception_status <> 'approved' then
    raise exception 'Deal has unresolved issues without an approved exception';
  end if;

  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'), hashtext(d.talent_id::text));
  select * into r from public.booking_schedule_reservations
  where booking_id = b.id and status = 'held' for update;
  if not found or r.deal_id <> d.id or r.talent_id <> d.talent_id
     or r.talent_offer_id <> d.talent_offer_id then
    raise exception 'Exact held duty reservation is required before securing booking';
  end if;
  select * into br from public.briefs where id = b.brief_id for update;
  if not found or br.status <> 'terms_agreed' or b.event_date is distinct from br.event_date then
    raise exception 'Buyer terms stage is not finalized on the brief';
  end if;
  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if not found or o.status <> 'confirmed' or o.availability_status <> 'confirmed'
     or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id
     or o.quote_valid_until is distinct from r.offer_valid_until then
    raise exception 'Talent offer no longer matches the held reservation';
  end if;

  -- Lock evidence rows after booking/deal/reservation to keep a single lock order.
  perform 1 from public.payments
  where booking_id = b.id and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
  order by id for update;
  for v_payment in
    select * from public.payments
    where booking_id = b.id
      and booking_schedule_reservation_id = r.id
      and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
      and status = 'paid'
      and coalesce(trim(provider),'') <> ''
      and coalesce(trim(provider_reference),'') <> ''
      and coalesce(trim(evidence_key),'') <> ''
      and (
        receipt_timing = 'on_time'
        or (receipt_timing = 'late' and reconciliation_status = 'accepted')
      )
    order by id
  loop
    v_paid := v_paid + v_payment.amount;
  end loop;

  select * into m from public.payment_milestones
  where booking_id = b.id and party = 'buyer' order by sequence_no asc limit 1 for update;
  if not found then raise exception 'Buyer payment milestones are missing'; end if;
  if m.calculation_type = 'percentage' then v_required := round(b.buyer_price * (coalesce(m.percentage,0) / 100.0));
  elsif m.calculation_type = 'fixed_amount' then v_required := coalesce(m.amount,0);
  else v_required := b.buyer_price; end if;
  if v_required <= 0 then raise exception 'Initial buyer security amount is invalid'; end if;

  if b.financial_security_status = 'satisfied'
     and b.financial_security_type in ('approved_po_credit','authorized_exception') then
    if length(trim(coalesce(b.financial_security_reference,''))) < 3
       or length(trim(coalesce(b.financial_security_recorded_by,''))) not between 3 and 200
       or b.financial_security_recorded_at is null then
      raise exception 'Manual financial security audit evidence is incomplete';
    end if;
    if b.financial_security_type = 'authorized_exception' and d.exception_status <> 'approved' then
      raise exception 'Commercial exception is not approved';
    end if;
    if r.hold_expires_at <= v_now or r.offer_valid_until <= v_now or o.quote_valid_until <= v_now then
      raise exception 'Manual security requires a live hold and offer at secured transition';
    end if;
    select * into a from public.booking_manual_security_approvals
    where booking_id = b.id and deal_id = d.id
      and booking_schedule_reservation_id = r.id
      and security_type = b.financial_security_type
      and reference = b.financial_security_reference
      and approved_by = b.financial_security_recorded_by
      and approved_at = b.financial_security_recorded_at
      and valid_until > v_now
    order by approved_at desc limit 1 for update;
    if not found then raise exception 'Active immutable manual security approval was not found'; end if;
    if a.security_type = 'approved_po_credit' and a.approved_amount < v_required then
      raise exception 'Approved PO/credit amount is below the initial booking security requirement';
    end if;
    v_security_type := b.financial_security_type;
  elsif v_paid >= b.buyer_price and b.buyer_price > 0 then
    v_security_type := 'full_payment_received';
  elsif v_paid >= v_required then
    v_security_type := 'deposit_received';
  else
    raise exception 'Reservation-bound financial security condition is not satisfied';
  end if;

  insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
  values (txid_current(),b.id,'secure_booking');
  update public.booking_schedule_reservations set
    status = 'secured', secured_at = v_now, updated_at = v_now
  where id = r.id and status = 'held';
  if not found then raise exception 'Schedule reservation changed before security transition'; end if;

  update public.bookings set
    status = 'secured', financial_security_type = v_security_type,
    financial_security_status = 'satisfied', secured_at = v_now, updated_at = v_now
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Booking security transition lost a concurrent update'; end if;
  update public.briefs set status = 'booked', updated_at = v_now
  where id = b.brief_id and status = 'terms_agreed';
  if not found then raise exception 'Brief changed before booking security was finalized'; end if;
  delete from public.ns_booking_transition_authorizations
  where transaction_id = txid_current() and booking_id = b.id and action = 'secure_booking';
  return query select 'secured'::text,v_security_type::text,v_paid::bigint;
end;
$$;

-- Booking creation owns the complete promise: terms, both schedules and hold.
-- No caller-supplied commercial snapshot is accepted.
create or replace function public.ns_create_booking_with_hold_v1(
  p_brief_id uuid,
  p_expected_deal_id uuid,
  p_hold_expires_at timestamptz,
  p_travel_summary text,
  p_nearby_commitments_summary text,
  p_reviewed_by text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  br public.briefs%rowtype;
  pi public.proposal_items%rowtype;
  o public.talent_offers%rowtype;
  t public.talents%rowtype;
  s public.buyer_selections%rowtype;
  r public.booking_schedule_reservations%rowtype;
  review public.booking_schedule_feasibility_reviews%rowtype;
  v_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_breakdown jsonb := '{}'::jsonb;
  v_key text;
  v_amount numeric;
  v_direct numeric;
  v_party text;
  v_schedule jsonb;
  v_row jsonb;
  v_seq integer;
  v_now timestamptz;
begin
  if p_brief_id is null or p_hold_expires_at is null
     or length(trim(coalesce(p_travel_summary,''))) < 10
     or length(trim(coalesce(p_nearby_commitments_summary,''))) < 10
     or length(trim(coalesce(p_reviewed_by,''))) not between 3 and 200 then
    raise exception 'Explicit travel review, nearby obligations, reviewer and hold cutoff are required';
  end if;

  -- Serialize the absent-booking case too. Existing-booking lock precedes deal
  -- and talent locks, matching the hold/security RPCs.
  perform pg_advisory_xact_lock(hashtext('ns_booking_creation'), hashtext(p_brief_id::text));
  select * into b from public.bookings where brief_id = p_brief_id for update;
  select * into d from public.deals where brief_id = p_brief_id for update;
  if not found or d.status is distinct from 'locked' or d.id is distinct from p_expected_deal_id then
    raise exception 'A locked deal is required before booking creation';
  end if;
  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'), hashtext(d.talent_id::text));
  v_now := clock_timestamp();

  if b.id is not null then
    select * into r from public.booking_schedule_reservations
    where booking_id = b.id and status in ('held','secured') for update;
    if not found or b.deal_id is distinct from d.id
       or b.status not in ('pending_security','secured','pre_show','incident','completed')
       or (r.status = 'held' and r.hold_expires_at <= v_now)
       or r.hold_expires_at is distinct from p_hold_expires_at then
      raise exception 'Existing booking has no matching live reservation; explicit recovery is required';
    end if;
    select * into review from public.booking_schedule_feasibility_reviews where id = r.feasibility_review_id;
    if review.travel_assessment is distinct from jsonb_build_object('summary',trim(p_travel_summary))
       or review.nearby_commitments_snapshot is distinct from jsonb_build_array(jsonb_build_object('summary',trim(p_nearby_commitments_summary)))
       or review.reviewed_by is distinct from trim(p_reviewed_by) then
      raise exception 'Retry evidence differs from the original booking review';
    end if;
    return jsonb_build_object('bookingId',b.id,'reservationId',r.id,'status',b.status,'existing',true);
  end if;

  select * into br from public.briefs where id = p_brief_id for update;
  if not found or br.status is distinct from 'buyer_selected' or br.event_date is null then
    raise exception 'Buyer-selected brief and event date are required';
  end if;
  select * into s from public.buyer_selections where brief_id = br.id and status = 'selected' for share;
  if not found or s.talent_id is distinct from d.talent_id then
    raise exception 'Buyer selection does not match the locked deal';
  end if;
  if d.talent_terms_status is distinct from 'confirmed'
     or d.buyer_terms_status is distinct from 'recommended'
     or d.funding_gap_status is distinct from 'safe'
     or (cardinality(coalesce(d.unresolved_issues,'{}'::text[])) > 0 and d.exception_status is distinct from 'approved')
     or length(trim(coalesce(d.cancellation_terms,''))) = 0 then
    raise exception 'Locked commercial terms are not ready for booking creation';
  end if;
  if jsonb_typeof(d.buyer_payment_schedule) is distinct from 'array'
     or jsonb_typeof(d.talent_payment_schedule) is distinct from 'array' then
    raise exception 'Both locked payment schedules must be arrays';
  end if;
  if jsonb_array_length(d.buyer_payment_schedule) = 0 or jsonb_array_length(d.talent_payment_schedule) = 0 then
    raise exception 'Both locked payment schedules are required';
  end if;
  select * into pi from public.proposal_items where id = d.proposal_item_id for share;
  if not found or pi.talent_id is distinct from d.talent_id
     or pi.talent_offer_id is distinct from d.talent_offer_id then
    raise exception 'Selected proposal does not match the locked deal';
  end if;
  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if not found or o.brief_id is distinct from br.id or o.talent_id is distinct from d.talent_id
     or o.status is distinct from 'confirmed' or o.availability_status is distinct from 'confirmed'
     or o.quote_valid_until is null or o.quote_valid_until <= clock_timestamp()
     or pi.show_start_local is null or pi.show_end_local is null or pi.show_timezone is null
     or pi.show_start_local is distinct from o.show_start_local
     or pi.show_end_local is distinct from o.show_end_local
     or pi.show_timezone is distinct from o.show_timezone then
    raise exception 'Current manager offer and frozen performance snapshot must match';
  end if;
  if p_hold_expires_at <= clock_timestamp() then raise exception 'Hold cutoff has elapsed'; end if;
  select * into t from public.talents where id = d.talent_id for share;
  if not found then raise exception 'Selected talent was not found'; end if;
  if d.buyer_price is null or d.buyer_price <= 0
     or coalesce(pi.currency,'IDR') <> 'IDR'
     or coalesce(d.direct_costs,0) + coalesce(d.taxes_and_payment_fees,0) > d.buyer_price then
    raise exception 'Locked buyer pricing is invalid';
  end if;

  -- Derive pricing from the locked rows, never browser-supplied amounts.
  v_snapshot := jsonb_build_object(
    'schema_version',1,'deal_id',d.id,'brief_id',br.id,'proposal_item_id',pi.id,
    'event',jsonb_build_object(
      'talent_id',t.id,'talent_name',t.name,'event_type',br.event_type,'event_date',br.event_date,
      'show_start_local',pi.show_start_local,'show_end_local',pi.show_end_local,
      'show_timezone',pi.show_timezone,'city',br.city,'venue',br.venue),
    'pricing',jsonb_build_object(
      'currency',coalesce(pi.currency,'IDR'),'buyer_price',d.buyer_price,
      'direct_costs',coalesce(d.direct_costs,0),'taxes_and_payment_fees',coalesce(d.taxes_and_payment_fees,0),
      'breakdown_mode','aggregate','breakdown',jsonb_build_object(
        'talent_fee',d.buyer_price-coalesce(d.direct_costs,0)-coalesce(d.taxes_and_payment_fees,0),
        'direct_costs',coalesce(d.direct_costs,0),'taxes_fees',coalesce(d.taxes_and_payment_fees,0))),
    'payment_schedule',d.buyer_payment_schedule,
    'terms',jsonb_build_object('cancellation_terms',d.cancellation_terms,'rider_notes',d.rider_notes,
      'special_conditions',d.special_conditions,'included_costs',pi.included_costs,'excluded_costs',pi.excluded_costs),
    'offer_valid_until',o.quote_valid_until);

  foreach v_key in array array['talent_fee','transport','accommodation','technical_rider','taxes_fees','other'] loop
    v_amount := 0;
    if jsonb_typeof(pi.price_breakdown -> v_key) = 'number' then
      v_amount := (pi.price_breakdown ->> v_key)::numeric;
      if v_amount < 0 or v_amount > 9007199254740991 or trunc(v_amount) <> v_amount then v_amount := 0; end if;
    end if;
    v_breakdown := v_breakdown || jsonb_build_object(v_key,v_amount);
  end loop;
  v_breakdown := v_breakdown || jsonb_build_object('other_label',nullif(trim(pi.price_breakdown ->> 'other_label'),''));
  v_direct := (v_breakdown->>'transport')::numeric + (v_breakdown->>'accommodation')::numeric
    + (v_breakdown->>'technical_rider')::numeric + (v_breakdown->>'other')::numeric;
  if pi.buyer_price = d.buyer_price and v_direct = coalesce(d.direct_costs,0)
     and (v_breakdown->>'taxes_fees')::numeric = coalesce(d.taxes_and_payment_fees,0)
     and (v_breakdown->>'talent_fee')::numeric + v_direct + (v_breakdown->>'taxes_fees')::numeric = d.buyer_price then
    v_snapshot := jsonb_set(jsonb_set(v_snapshot,'{pricing,breakdown}',v_breakdown),'{pricing,breakdown_mode}','"detailed"'::jsonb);
  end if;

  insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
  values(txid_current(),v_id,'create_booking');
  insert into public.bookings(id,brief_id,deal_id,talent_id,event_date,venue,city,
    buyer_price,talent_payable,direct_cost,status,financial_security_status,buyer_terms_snapshot)
  values(v_id,br.id,d.id,d.talent_id,br.event_date,br.venue,br.city,
    d.buyer_price,d.talent_payable,coalesce(d.direct_costs,0),'pending_security','pending',v_snapshot)
  returning * into b;

  foreach v_party in array array['buyer','talent'] loop
    v_schedule := case when v_party = 'buyer' then d.buyer_payment_schedule else d.talent_payment_schedule end;
    v_seq := 0;
    for v_row in select value from jsonb_array_elements(v_schedule) loop
      v_seq := v_seq + 1;
      insert into public.payment_milestones(booking_id,party,milestone_type,sequence_no,
        calculation_type,percentage,amount,due_basis,due_offset_days,custom_due_date,
        refundable,cancellation_note,status,notes)
      values(b.id,v_party,v_row->>'milestone_type',v_seq,v_row->>'calculation_type',
        (v_row->>'percentage')::numeric,(v_row->>'amount')::bigint,v_row->>'due_basis',
        coalesce((v_row->>'due_offset_days')::integer,0),(v_row->>'custom_due_date')::date,
        (v_row->>'refundable')::boolean,v_row->>'cancellation_note','planned',v_row->>'notes');
    end loop;
  end loop;
  review := public.ns_record_schedule_feasibility_review_v1(d.id,'approved','feasible',
    jsonb_build_array(jsonb_build_object('summary',trim(p_nearby_commitments_summary))),
    jsonb_build_object('summary',trim(p_travel_summary)),trim(p_reviewed_by));
  r := public.ns_hold_booking_schedule_v1(b.id,review.id,p_hold_expires_at);
  if r.hold_expires_at <= clock_timestamp() then raise exception 'Hold cutoff elapsed while reserving'; end if;
  delete from public.ns_booking_transition_authorizations
  where transaction_id = txid_current() and booking_id = b.id and action = 'create_booking';
  return jsonb_build_object('bookingId',b.id,'reservationId',r.id,'status',b.status,'existing',false);
end;
$$;

create or replace function public.ns_guard_booking_creation_and_terms_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r public.booking_schedule_reservations%rowtype;
begin
  if tg_op = 'INSERT' then
    if not exists(select 1 from public.ns_booking_transition_authorizations a
      where a.transaction_id = txid_current() and a.booking_id = new.id and a.action = 'create_booking') then
      raise exception 'Booking creation must use the atomic booking-and-hold RPC';
    end if;
    if new.buyer_terms_accepted_at is not null then raise exception 'New booking cannot contain buyer acceptance'; end if;
  else
    if new.buyer_terms_snapshot is distinct from old.buyer_terms_snapshot then
      raise exception 'Issued buyer terms are immutable; use explicit recovery';
    end if;
    if old.buyer_terms_accepted_at is null and new.buyer_terms_accepted_at is not null then
      select * into r from public.booking_schedule_reservations
      where booking_id = new.id and status = 'held' for update;
      if not found or r.deal_id is distinct from new.deal_id or r.talent_id is distinct from new.talent_id
         or r.hold_expires_at <= clock_timestamp() or r.offer_valid_until <= clock_timestamp() then
        raise exception 'Buyer acceptance requires the exact live held reservation';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_booking_creation_and_terms_v1 on public.bookings;
create trigger trg_booking_creation_and_terms_v1 before insert or update on public.bookings
for each row execute function public.ns_guard_booking_creation_and_terms_v1();

create or replace function public.ns_guard_booking_milestone_creation_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Booking milestone snapshots cannot be deleted; use an explicit lifecycle transition';
  end if;
  if not exists(select 1 from public.ns_booking_transition_authorizations a
    where a.transaction_id = txid_current() and a.booking_id = new.booking_id and a.action = 'create_booking') then
    raise exception 'Booking milestones must be created by the atomic booking-and-hold RPC';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_booking_milestone_creation_v1 on public.payment_milestones;
create trigger trg_booking_milestone_creation_v1 before insert or delete on public.payment_milestones
for each row execute function public.ns_guard_booking_milestone_creation_v1();
revoke all on function public.ns_guard_booking_milestone_creation_v1() from public, anon, authenticated;

-- Shared conservative eligibility check. An issued request protects the slot
-- even if failed/cancelled; evidence must be resolved by an explicit lifecycle.
create or replace function public.ns_booking_untouched_for_expiry_v1(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.bookings b where b.id=p_booking_id
    and b.status='pending_security' and b.buyer_terms_accepted_at is null
    and b.buyer_terms_accepted_deal_id is null and b.buyer_terms_accepted_snapshot is null
    and b.buyer_terms_acceptance_source is null and b.secured_at is null
    and b.financial_security_status='pending' and b.financial_security_type is null
    and b.financial_security_reference is null and b.financial_security_recorded_at is null
    and b.financial_security_recorded_by is null
    and not exists(select 1 from public.payments p where p.booking_id=b.id)
    and not exists(select 1 from public.booking_manual_security_approvals a where a.booking_id=b.id)
    and not exists(select 1 from public.payment_milestones m where m.booking_id=b.id
      and m.status not in ('planned','due'))
    and not exists(select 1 from public.cancellation_cases c where c.booking_id=b.id and c.status<>'void')
    and not exists(select 1 from public.recovery_cases c where c.original_booking_id=b.id and c.status<>'void')
    and not exists(select 1 from public.buyer_refunds f where f.booking_id=b.id)
    and not exists(select 1 from public.talent_settlements s where s.booking_id=b.id)
  );
$$;
revoke all on function public.ns_booking_untouched_for_expiry_v1(uuid) from public,anon,authenticated,service_role;

-- Called opportunistically by hold acquisition and available for a future
-- worker. No cron/production worker is enabled by this draft migration.
create or replace function public.ns_expire_untouched_holds_v1(p_talent_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  candidate record;
  b public.bookings%rowtype;
  r public.booking_schedule_reservations%rowtype;
  expired_count integer := 0;
begin
  if p_talent_id is null then raise exception 'Talent ID is required for hold cleanup'; end if;
  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'),hashtext(p_talent_id::text));
  for candidate in
    select sr.id,sr.booking_id from public.booking_schedule_reservations sr
    where sr.talent_id=p_talent_id and sr.status='held'
      and sr.hold_expires_at<=clock_timestamp()
      and public.ns_booking_untouched_for_expiry_v1(sr.booking_id)
    order by sr.hold_expires_at,sr.id limit 100
  loop
    -- Acceptance, requests, payment evidence and manual security lock booking
    -- first. SKIP LOCKED avoids the reverse talent->booking wait/deadlock.
    select * into b from public.bookings where id=candidate.booking_id for update skip locked;
    if not found then continue; end if;
    select * into r from public.booking_schedule_reservations where id=candidate.id for update skip locked;
    if not found then continue; end if;
    if r.status<>'held' or r.talent_id is distinct from p_talent_id
       or r.deal_id is distinct from b.deal_id or r.hold_expires_at>clock_timestamp()
       or not public.ns_booking_untouched_for_expiry_v1(b.id) then continue; end if;
    insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
    values(txid_current(),b.id,'expire_hold');
    update public.booking_schedule_reservations set status='expired',released_at=clock_timestamp(),
      release_reason='automatic_untouched_hold_expiry_v1',updated_at=clock_timestamp() where id=r.id;
    delete from public.ns_booking_transition_authorizations
      where transaction_id=txid_current() and booking_id=b.id and action='expire_hold';
    expired_count := expired_count+1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.ns_expire_untouched_holds_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_expire_untouched_holds_v1(uuid) to service_role;

-- Every active reservation transition requires a private transaction token.
create or replace function public.ns_protect_booking_schedule_reservation_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Schedule reservations cannot be deleted; use an authorized lifecycle transition';
  end if;
  if new.booking_id is distinct from old.booking_id
     or new.feasibility_review_id is distinct from old.feasibility_review_id
     or new.deal_id is distinct from old.deal_id
     or new.proposal_item_id is distinct from old.proposal_item_id
     or new.talent_offer_id is distinct from old.talent_offer_id
     or new.talent_id is distinct from old.talent_id
     or new.duty_start_at is distinct from old.duty_start_at
     or new.duty_end_at is distinct from old.duty_end_at
     or new.duty_location is distinct from old.duty_location
     or new.offer_valid_until is distinct from old.offer_valid_until
     or new.hold_expires_at is distinct from old.hold_expires_at
     or new.held_at is distinct from old.held_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Schedule reservation identity, interval and cutoffs are immutable';
  end if;
  if old.status = 'held' and new.status = 'expired' then
    if not exists(select 1 from public.ns_booking_transition_authorizations a
      where a.transaction_id=txid_current() and a.booking_id=old.booking_id and a.action='expire_hold')
      or old.hold_expires_at>clock_timestamp()
      or not public.ns_booking_untouched_for_expiry_v1(old.booking_id) then
      raise exception 'Reservation expiry must use the serialized hold cleanup path';
    end if;
  elsif old.status = 'held' and new.status = 'secured' then
    if not exists(select 1 from public.ns_booking_transition_authorizations a
      where a.transaction_id=txid_current() and a.booking_id=old.booking_id and a.action='secure_booking') then
      raise exception 'Reservation security must use the atomic secured-booking RPC';
    end if;
  elsif old.status in ('held','secured') and new.status = 'released' then
    if not exists(select 1 from public.ns_booking_transition_authorizations a
      where a.transaction_id=txid_current() and a.booking_id=old.booking_id
        and a.action in ('finalize_cancellation','abandon_pending')) then
      raise exception 'Reservation release must use an atomic lifecycle RPC';
    end if;
  else
    raise exception 'Invalid schedule reservation transition: % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function public.ns_protect_payment_request_snapshot_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.request_issued_at is not null then
    if new.payment_milestone_id is distinct from old.payment_milestone_id
       or new.booking_schedule_reservation_id is distinct from old.booking_schedule_reservation_id
       or new.currency is distinct from old.currency or new.amount is distinct from old.amount
       or new.request_reference is distinct from old.request_reference
       or new.request_issued_at is distinct from old.request_issued_at
       or new.request_due_date is distinct from old.request_due_date
       or new.request_expires_at is distinct from old.request_expires_at
       or new.request_snapshot is distinct from old.request_snapshot
       or new.payment_instructions_snapshot is distinct from old.payment_instructions_snapshot then
      raise exception 'Issued payment request snapshot and cutoff are immutable';
    end if;
  end if;
  if (new.provider is distinct from old.provider
      or new.provider_reference is distinct from old.provider_reference
      or new.evidence_key is distinct from old.evidence_key
      or new.paid_at is distinct from old.paid_at
      or new.receipt_timing is distinct from old.receipt_timing
      or new.reconciliation_status is distinct from old.reconciliation_status
      or new.reconciliation_note is distinct from old.reconciliation_note
      or new.reconciled_at is distinct from old.reconciled_at
      or new.reconciled_by is distinct from old.reconciled_by
      or (old.payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
          and new.status is distinct from old.status))
     and not exists (
       select 1 from public.ns_payment_transition_authorizations a
       where a.transaction_id=txid_current() and a.payment_id=old.id
         and a.action in ('record_evidence','accept_late','cancel_request')
     ) then
    raise exception 'Buyer payment evidence, status and reconciliation must use an authorized RPC';
  end if;
  return new;
end;
$$;

create or replace function public.ns_guard_cancellation_case_settlement_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'settled' and old.status is distinct from 'settled'
     and not exists(select 1 from public.ns_booking_transition_authorizations a
       where a.transaction_id=txid_current() and a.booking_id=old.booking_id
         and a.action='finalize_cancellation') then
    raise exception 'Cancellation settlement must use the atomic finalization RPC';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_payment_request_snapshot_v1 on public.payments;
create trigger trg_protect_payment_request_snapshot_v1 before update on public.payments
for each row execute function public.ns_protect_payment_request_snapshot_v1();
drop trigger if exists trg_guard_cancellation_case_settlement_v1 on public.cancellation_cases;
create trigger trg_guard_cancellation_case_settlement_v1 before update on public.cancellation_cases
for each row execute function public.ns_guard_cancellation_case_settlement_v1();

create function public.ns_abandon_pending_booking_v1(
  p_booking_id uuid,
  p_abandoned_by text,
  p_reason text
) returns public.booking_pre_security_abandonments
language plpgsql security definer set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  r public.booking_schedule_reservations%rowtype;
  existing public.booking_pre_security_abandonments%rowtype;
  result_row public.booking_pre_security_abandonments%rowtype;
  revoked_ids uuid[] := '{}'::uuid[];
  v_now timestamptz := clock_timestamp();
begin
  if length(trim(coalesce(p_abandoned_by,''))) not between 3 and 200 then
    raise exception 'Abandonment actor identity is required';
  end if;
  if length(trim(coalesce(p_reason,''))) < 10 then
    raise exception 'Abandonment reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('ns_booking_lifecycle'),hashtext(p_booking_id::text));
  select * into existing from public.booking_pre_security_abandonments
  where booking_id=p_booking_id for update;
  if found then
    if existing.abandoned_by is distinct from trim(p_abandoned_by)
       or existing.reason is distinct from trim(p_reason) then
      raise exception 'Pre-security abandonment retry audit differs from the recorded decision';
    end if;
    return existing;
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status<>'pending_security' or b.financial_security_status<>'pending'
     or b.secured_at is not null then
    raise exception 'Only a financially unsecured pending booking can be abandoned';
  end if;
  if exists(select 1 from public.cancellation_cases where booking_id=b.id and status<>'void') then
    raise exception 'An active cancellation case requires the reconciled cancellation path';
  end if;
  if exists(select 1 from public.booking_manual_security_approvals where booking_id=b.id) then
    raise exception 'Manual security evidence requires the reconciled cancellation path';
  end if;

  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'),hashtext(b.talent_id::text));
  select * into r from public.booking_schedule_reservations
  where booking_id=b.id and status='held' for update;
  if not found or r.deal_id is distinct from b.deal_id or r.talent_id is distinct from b.talent_id then
    raise exception 'Exact held reservation was not found for abandonment';
  end if;
  perform 1 from public.payments where booking_id=b.id order by id for update;
  if exists(select 1 from public.payments where booking_id=b.id and (
      status in ('paid','refunded') or paid_at is not null or provider is not null
      or provider_reference is not null or evidence_key is not null
      or receipt_timing is not null or reconciliation_status is not null
  )) then
    raise exception 'Payment evidence requires reconciliation before abandonment';
  end if;

  select coalesce(array_agg(id order by id),'{}'::uuid[]) into revoked_ids
  from public.payments where booking_id=b.id
    and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment') and status='pending';
  insert into public.booking_pre_security_abandonments(
    booking_id,deal_id,booking_schedule_reservation_id,buyer_terms_were_accepted,
    revoked_payment_request_ids,abandoned_by,reason,abandoned_at
  ) values(
    b.id,b.deal_id,r.id,b.buyer_terms_accepted_at is not null,
    revoked_ids,trim(p_abandoned_by),trim(p_reason),v_now
  ) returning * into result_row;
  insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
  values(txid_current(),b.id,'abandon_pending');
  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  select txid_current(),p.id,'cancel_request' from public.payments p
  where p.id=any(revoked_ids);
  update public.payments set status='cancelled',updated_at=v_now where id=any(revoked_ids);
  update public.payment_milestones set status='cancelled',updated_at=v_now
  where booking_id=b.id and status in ('planned','due');
  update public.booking_schedule_reservations set status='released',released_at=v_now,
    release_reason='pre_security_abandonment: '||trim(p_reason),updated_at=v_now
  where id=r.id and status='held';
  if not found then raise exception 'Held reservation changed before abandonment'; end if;
  update public.bookings set status='cancelled',updated_at=v_now where id=b.id;
  update public.briefs set status='cancelled',updated_at=v_now where id=b.brief_id;
  delete from public.ns_payment_transition_authorizations
    where transaction_id=txid_current() and action='cancel_request';
  delete from public.ns_booking_transition_authorizations
    where transaction_id=txid_current() and booking_id=b.id and action='abandon_pending';
  return result_row;
end;
$$;

drop function if exists public.ns_finalize_cancellation_v1(uuid);
create function public.ns_finalize_cancellation_v1(
  p_case_id uuid,
  p_released_by text,
  p_release_note text
) returns public.cancellation_cases
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cancellation_cases%rowtype;
  b public.bookings%rowtype;
  r public.booking_schedule_reservations%rowtype;
  rc public.recovery_cases%rowtype;
  refund_total bigint := 0;
  talent_gross bigint := 0;
  talent_reversed bigint := 0;
  v_now timestamptz := clock_timestamp();
  result_row public.cancellation_cases%rowtype;
begin
  if length(trim(coalesce(p_released_by,''))) not between 3 and 200 then
    raise exception 'Reservation releaser identity is required';
  end if;
  if length(trim(coalesce(p_release_note,''))) < 10 then
    raise exception 'Reservation release decision note is required';
  end if;

  select * into c from public.cancellation_cases where id=p_case_id for update;
  if not found then raise exception 'Cancellation case not found'; end if;
  if c.status='settled' then
    if c.reservation_released_by is distinct from trim(p_released_by)
       or c.reservation_release_note is distinct from trim(p_release_note) then
      raise exception 'Cancellation finalization retry audit differs from the settled decision';
    end if;
    return c;
  end if;
  if c.status<>'approved' then raise exception 'Cancellation case is not approved'; end if;
  select * into b from public.bookings where id=c.booking_id for update;
  if not found or b.status not in ('secured','pre_show','incident') then
    raise exception 'Active secured booking was not found for cancellation';
  end if;
  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'),hashtext(b.talent_id::text));

  select * into rc from public.recovery_cases
  where original_booking_id=b.id and status<>'void' limit 1 for update;
  if found and rc.status not in ('replacement_secured','closed_no_replacement') then
    raise exception 'Original reservation cannot be released while replacement recovery is active';
  end if;
  select * into r from public.booking_schedule_reservations
  where booking_id=b.id and status='secured' for update;
  if not found or r.deal_id is distinct from b.deal_id or r.talent_id is distinct from b.talent_id then
    raise exception 'Exact secured reservation was not found for cancellation';
  end if;
  if exists(select 1 from public.payments where booking_id=b.id
    and receipt_timing='late' and reconciliation_status='pending') then
    raise exception 'Pending late-transfer reconciliation blocks reservation release';
  end if;

  select coalesce(sum(amount),0)::bigint into refund_total
  from public.buyer_refunds where cancellation_case_id=c.id;
  select coalesce(sum(amount),0)::bigint into talent_gross
  from public.talent_settlements where booking_id=b.id;
  select coalesce(sum(amount),0)::bigint into talent_reversed
  from public.talent_settlement_reversals where booking_id=b.id;
  if refund_total<>c.buyer_refund_amount then raise exception 'Buyer refund reconciliation is incomplete'; end if;
  if talent_gross-talent_reversed<>c.talent_due_amount then raise exception 'Talent settlement reconciliation is incomplete'; end if;

  insert into public.ns_booking_transition_authorizations(transaction_id,booking_id,action)
  values(txid_current(),b.id,'finalize_cancellation');
  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  select txid_current(),p.id,'cancel_request' from public.payments p
  where p.booking_id=b.id and p.payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
    and p.status='pending';
  update public.payments set status='cancelled',updated_at=v_now
  where booking_id=b.id and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
    and status='pending';
  update public.payment_milestones set status='cancelled',updated_at=v_now
  where booking_id=b.id and status in ('planned','due');
  update public.booking_schedule_reservations set status='released',released_at=v_now,
    release_reason='financially_reconciled_cancellation: '||trim(p_release_note),updated_at=v_now
  where id=r.id and status='secured';
  if not found then raise exception 'Secured reservation changed before release'; end if;
  update public.bookings set status='cancelled',updated_at=v_now where id=b.id;
  update public.briefs set status='cancelled',updated_at=v_now where id=b.brief_id;
  update public.cancellation_cases set status='settled',settled_at=v_now,updated_at=v_now,
    reservation_released_at=v_now,reservation_released_by=trim(p_released_by),
    reservation_release_note=trim(p_release_note)
  where id=c.id returning * into result_row;
  delete from public.ns_payment_transition_authorizations
  where transaction_id=txid_current() and action='cancel_request';
  delete from public.ns_booking_transition_authorizations
  where transaction_id=txid_current() and booking_id=b.id and action='finalize_cancellation';
  return result_row;
end;
$$;

revoke all on function public.ns_finalize_cancellation_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ns_finalize_cancellation_v1(uuid,text,text) to service_role;
revoke all on function public.ns_abandon_pending_booking_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ns_abandon_pending_booking_v1(uuid,text,text) to service_role;
revoke all on function public.ns_protect_booking_pre_security_abandonment_v1() from public,anon,authenticated;
revoke all on function public.ns_guard_cancellation_case_settlement_v1() from public,anon,authenticated;
revoke all on function public.ns_protect_booking_schedule_reservation_v1() from public,anon,authenticated;
revoke all on function public.ns_protect_payment_request_snapshot_v1() from public,anon,authenticated;

revoke all on function public.ns_create_booking_with_hold_v1(uuid,uuid,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.ns_create_booking_with_hold_v1(uuid,uuid,timestamptz,text,text,text) to service_role;
revoke all on function public.ns_guard_booking_creation_and_terms_v1() from public, anon, authenticated;

create or replace function public.ns_booking_creation_ready_v1()
returns boolean language sql stable security invoker set search_path = ''
as $$ select to_regprocedure('public.ns_create_booking_with_hold_v1(uuid,uuid,timestamptz,text,text,text)') is not null; $$;
revoke all on function public.ns_booking_creation_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_booking_creation_ready_v1() to service_role;

create or replace function public.ns_booking_reservation_security_ready_v1()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select to_regclass('public.booking_schedule_reservations') is not null
    and to_regclass('public.ns_booking_transition_authorizations') is not null;
$$;

revoke all on function public.ns_record_manual_booking_security_v1(uuid,text,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.ns_record_manual_booking_security_v1(uuid,text,text,bigint,text,text) to service_role;
revoke all on function public.ns_secure_booking_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_secure_booking_v1(uuid) to service_role;
revoke all on function public.ns_booking_reservation_security_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_booking_reservation_security_ready_v1() to service_role;
revoke all on function public.ns_guard_booking_reservation_security_v1() from public, anon, authenticated;
revoke all on function public.ns_guard_brief_booked_reservation_v1() from public, anon, authenticated;
revoke all on function public.ns_protect_booking_manual_security_approval_v1() from public, anon, authenticated;

comment on function public.ns_record_manual_booking_security_v1(uuid,text,text,bigint,text,text) is
  'Records an immutable, amount-checked PO/credit or exception approval against the exact live held duty reservation.';
comment on function public.ns_secure_booking_v1(uuid) is
  'Atomically validates reservation-bound payment or manual security, converts held duty reservation to secured, and secures booking/brief.';

commit;
