-- Nusantara Star — payment request cutoff and late-transfer reconciliation V1 (DRAFT)
-- Apply only during the coordinated reservation cutover, after
-- supabase-booking-schedule-hold-foundation-v1.sql. This migration has not been applied.

begin;

alter table public.payments
  add column if not exists booking_schedule_reservation_id uuid null
    references public.booking_schedule_reservations(id) on delete restrict,
  add column if not exists request_expires_at timestamptz null,
  add column if not exists receipt_timing text null,
  add column if not exists reconciliation_status text null,
  add column if not exists reconciliation_note text null,
  add column if not exists reconciled_at timestamptz null,
  add column if not exists reconciled_by text null;

alter table public.payments drop constraint if exists payments_receipt_timing_check;
alter table public.payments add constraint payments_receipt_timing_check
  check (receipt_timing is null or receipt_timing in ('on_time','late'));

alter table public.payments drop constraint if exists payments_reconciliation_status_check;
alter table public.payments add constraint payments_reconciliation_status_check
  check (reconciliation_status is null or reconciliation_status in ('pending','accepted','rejected'));

-- NOT VALID avoids inventing values for historical requests. PostgreSQL still
-- enforces these constraints for every new or subsequently changed row.
alter table public.payments drop constraint if exists payments_request_cutoff_shape_check;
alter table public.payments add constraint payments_request_cutoff_shape_check check (
  request_issued_at is null
  or (
    booking_schedule_reservation_id is not null
    and request_expires_at is not null
    and request_expires_at > request_issued_at
  )
) not valid;

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
  or (receipt_timing = 'late' and reconciliation_status = 'rejected' and status in ('pending','refunded')
    and length(trim(coalesce(reconciliation_note,''))) >= 10
    and reconciled_at is not null and length(trim(coalesce(reconciled_by,''))) between 3 and 200)
) not valid;

create index if not exists idx_payments_pending_late_reconciliation
  on public.payments(booking_id, paid_at)
  where receipt_timing = 'late' and reconciliation_status = 'pending';

create table if not exists public.ns_payment_transition_authorizations (
  transaction_id bigint not null,
  payment_id uuid not null,
  action text not null check (action in ('create_request','record_evidence','accept_late')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (transaction_id, payment_id, action)
);
revoke all on table public.ns_payment_transition_authorizations
  from public, anon, authenticated, service_role;

create or replace function public.ns_protect_payment_request_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.request_issued_at is not null then
    if new.payment_milestone_id is distinct from old.payment_milestone_id
       or new.booking_schedule_reservation_id is distinct from old.booking_schedule_reservation_id
       or new.currency is distinct from old.currency
       or new.amount is distinct from old.amount
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
      or new.reconciled_by is distinct from old.reconciled_by)
     and not exists (
       select 1 from public.ns_payment_transition_authorizations a
       where a.transaction_id = txid_current() and a.payment_id = old.id
         and a.action in ('record_evidence','accept_late')
     ) then
    raise exception 'Buyer payment evidence and reconciliation must use an authorized RPC';
  end if;
  return new;
end;
$$;

create or replace function public.ns_guard_buyer_payment_cutoff_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  r public.booking_schedule_reservations%rowtype;
begin
  if new.payment_type not in ('buyer_deposit','buyer_balance','buyer_full_payment') then
    return new;
  end if;

  if new.status = 'paid' and new.request_issued_at is null then
    raise exception 'Buyer payment cannot become paid without an issued payment request';
  end if;
  if new.request_issued_at is null then return new; end if;

  if new.booking_schedule_reservation_id is null or new.request_expires_at is null
     or new.request_due_date is null or new.request_snapshot is null then
    raise exception 'Buyer payment request requires an immutable cutoff and schedule reservation';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1 from public.ns_payment_transition_authorizations a
    where a.transaction_id = txid_current() and a.payment_id = new.id
      and a.action = 'create_request'
  ) then
    raise exception 'Buyer payment requests must be issued through the authorized RPC';
  end if;

  select * into b from public.bookings where id = new.booking_id;
  if not found or b.buyer_terms_accepted_at is null
     or b.buyer_terms_accepted_deal_id is distinct from b.deal_id
     or b.buyer_terms_acceptance_source is distinct from 'signed_buyer_link'
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Accepted buyer terms are required for a buyer payment request';
  end if;

  select * into r from public.booking_schedule_reservations
  where id = new.booking_schedule_reservation_id;
  if not found or r.booking_id <> new.booking_id or r.status not in ('held','secured') then
    raise exception 'Buyer payment request requires the same booking active schedule reservation';
  end if;

  if tg_op = 'INSERT' and (new.request_expires_at > r.hold_expires_at
      or new.request_expires_at > r.offer_valid_until) then
    raise exception 'Buyer payment request cutoff cannot outlive the hold or offer';
  end if;

  if new.status = 'paid' then
    if new.paid_at is null then raise exception 'Paid buyer payment requires a transfer timestamp'; end if;
    if new.paid_at <= new.request_expires_at then
      if new.receipt_timing is distinct from 'on_time' then
        raise exception 'On-time buyer payment must record on-time receipt timing';
      end if;
    elsif new.receipt_timing is distinct from 'late'
       or new.reconciliation_status is distinct from 'accepted' then
      raise exception 'Late buyer transfer requires accepted reconciliation before paid status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_buyer_payment_cutoff_v1 on public.payments;
create trigger trg_guard_buyer_payment_cutoff_v1
before insert or update on public.payments
for each row execute function public.ns_guard_buyer_payment_cutoff_v1();

create or replace function public.ns_create_buyer_payment_request_v1(
  p_booking_id uuid,
  p_payment_instructions jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  pi public.proposal_items%rowtype;
  o public.talent_offers%rowtype;
  r public.booking_schedule_reservations%rowtype;
  m public.payment_milestones%rowtype;
  existing public.payments%rowtype;
  result_row public.payments%rowtype;
  v_used bigint := 0;
  v_resolved bigint := 0;
  v_payment_type text;
  v_due_date date;
  v_event_timezone text;
  v_request_expires_at timestamptz;
  v_now timestamptz := now();
  v_payment_id uuid := gen_random_uuid();
  v_reference text;
  v_snapshot jsonb;
  v_method text;
  v_provider_name text;
  v_destination text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pending_security' then raise exception 'First buyer payment request requires a pending-security booking'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;
  if b.buyer_terms_accepted_at is null
     or b.buyer_terms_accepted_deal_id <> b.deal_id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or b.buyer_terms_snapshot is null
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Exact buyer terms snapshot must be accepted before payment requests are issued';
  end if;

  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' or d.buyer_terms_status <> 'accepted'
     or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id
     or b.buyer_price is distinct from d.buyer_price then
    raise exception 'Booking and accepted locked deal are not ready for payment';
  end if;

  select * into pi from public.proposal_items where id = d.proposal_item_id for share;
  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if pi.id is null or o.id is null or pi.talent_offer_id <> o.id or pi.talent_id <> d.talent_id
     or pi.show_timezone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')
     or o.status <> 'confirmed' or o.availability_status <> 'confirmed'
     or o.quote_valid_until is null or o.quote_valid_until <= v_now then
    raise exception 'Talent offer and exact event time zone require reconfirmation before payment';
  end if;
  v_event_timezone := pi.show_timezone;

  select * into r from public.booking_schedule_reservations
  where booking_id = b.id and status = 'held' for update;
  if not found or r.deal_id <> d.id or r.proposal_item_id <> pi.id or r.talent_offer_id <> o.id
     or r.hold_expires_at <= v_now then
    raise exception 'Active held reservation for the exact accepted deal is required';
  end if;

  if p_payment_instructions is null or jsonb_typeof(p_payment_instructions) <> 'object' then
    raise exception 'Payment instructions are required';
  end if;
  v_method := trim(coalesce(p_payment_instructions ->> 'method',''));
  v_provider_name := trim(coalesce(p_payment_instructions ->> 'provider_name',''));
  v_destination := trim(coalesce(p_payment_instructions ->> 'destination',''));
  if v_method not in ('bank_transfer','payment_link','other') then raise exception 'Unsupported payment method'; end if;
  if v_provider_name = '' or v_destination = '' then raise exception 'Payment provider and destination are required'; end if;

  for m in
    select * from public.payment_milestones
    where booking_id = b.id and party = 'buyer'
    order by sequence_no
  loop
    if m.calculation_type = 'percentage' then
      v_resolved := round(b.buyer_price * (coalesce(m.percentage,0) / 100.0));
    elsif m.calculation_type = 'fixed_amount' then
      v_resolved := coalesce(m.amount,0);
    else
      v_resolved := greatest(0, b.buyer_price - v_used);
    end if;

    if m.status not in ('paid','waived','cancelled') then
      select * into existing from public.payments
      where payment_milestone_id = m.id
        and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
        and status in ('pending','paid')
      order by created_at desc limit 1;
      if found then
        if existing.booking_schedule_reservation_id = r.id
           and existing.request_expires_at > v_now then return existing; end if;
        raise exception 'Existing payment request expired or is bound to another reservation; revoke it before reissue';
      end if;
      exit;
    end if;
    v_used := v_used + v_resolved;
  end loop;

  if m.id is null then raise exception 'No buyer payment milestone remains'; end if;
  if v_resolved <= 0 then raise exception 'Resolved buyer milestone amount is invalid'; end if;
  if m.milestone_type = 'full_payment' then v_payment_type := 'buyer_full_payment';
  elsif m.milestone_type in ('deposit','booking_fee') then v_payment_type := 'buyer_deposit';
  else v_payment_type := 'buyer_balance'; end if;

  if m.due_basis = 'custom_date' then v_due_date := m.custom_due_date;
  elsif m.due_basis in ('event_date','event_completion') then v_due_date := b.event_date + m.due_offset_days;
  elsif m.due_basis = 'invoice_date' then
    if m.due_offset_days < 0 then raise exception 'Invoice-date milestone cannot be due before issue'; end if;
    v_due_date := (v_now at time zone v_event_timezone)::date + m.due_offset_days;
  elsif m.due_basis = 'booking_date' then
    if m.due_offset_days < 0 then raise exception 'Booking-date milestone cannot be issued after its due date'; end if;
    v_due_date := (b.created_at at time zone v_event_timezone)::date + m.due_offset_days;
  else raise exception 'Unsupported payment due basis'; end if;
  if v_due_date is null then raise exception 'Payment due date could not be resolved'; end if;

  v_request_expires_at := (v_due_date + time '23:59:59') at time zone v_event_timezone;
  if not (v_request_expires_at > v_now
      and v_request_expires_at <= r.hold_expires_at
      and v_request_expires_at <= r.offer_valid_until) then
    raise exception 'Payment cutoff requires a hold and offer valid through 23:59:59 on the due date';
  end if;

  v_reference := 'NS-PR-' || to_char(v_now at time zone 'Asia/Jakarta','YYMMDD') || '-'
    || upper(substr(replace(v_payment_id::text,'-',''),1,8));
  v_snapshot := jsonb_build_object(
    'schema_version', 2, 'request_reference', v_reference, 'booking_id', b.id,
    'deal_id', b.deal_id, 'payment_milestone_id', m.id,
    'booking_schedule_reservation_id', r.id, 'payment_type', v_payment_type,
    'currency', 'IDR', 'amount', v_resolved, 'issued_at', v_now,
    'due_date', v_due_date, 'expires_at', v_request_expires_at,
    'event_timezone', v_event_timezone,
    'milestone', jsonb_build_object(
      'sequence_no', m.sequence_no, 'milestone_type', m.milestone_type,
      'calculation_type', m.calculation_type, 'percentage', m.percentage,
      'fixed_amount', m.amount, 'due_basis', m.due_basis,
      'due_offset_days', m.due_offset_days, 'custom_due_date', m.custom_due_date,
      'refundable', m.refundable, 'cancellation_note', m.cancellation_note, 'notes', m.notes
    ),
    'event', b.buyer_terms_snapshot -> 'event',
    'accepted_terms_snapshot', b.buyer_terms_snapshot
  );

  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  values (txid_current(),v_payment_id,'create_request');
  insert into public.payments (
    id, booking_id, payment_milestone_id, booking_schedule_reservation_id,
    payment_type, amount, currency, status, idempotency_key, request_reference,
    request_issued_at, request_due_date, request_expires_at, request_snapshot,
    payment_instructions_snapshot
  ) values (
    v_payment_id, b.id, m.id, r.id, v_payment_type, v_resolved, 'IDR', 'pending',
    'buyer-payment-request:' || b.id::text || ':' || m.id::text || ':' || v_payment_id::text,
    v_reference, v_now, v_due_date, v_request_expires_at, v_snapshot, p_payment_instructions
  ) returning * into result_row;
  delete from public.ns_payment_transition_authorizations
  where transaction_id = txid_current() and payment_id = v_payment_id and action = 'create_request';

  update public.payment_milestones set status = 'due', updated_at = v_now
  where id = m.id and status = 'planned';
  return result_row;
end;
$$;

create or replace function public.ns_record_buyer_payment_v1(
  p_booking_id uuid,
  p_payment_id uuid,
  p_provider text,
  p_provider_reference text,
  p_paid_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  p public.payments%rowtype;
  r public.booking_schedule_reservations%rowtype;
  m public.payment_milestones%rowtype;
  v_provider text := trim(coalesce(p_provider,''));
  v_reference text := trim(coalesce(p_provider_reference,''));
  v_evidence_key text;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if v_provider = '' or v_reference = '' then raise exception 'Payment provider and transaction reference are required'; end if;
  if v_paid_at > now() + interval '10 minutes' then raise exception 'Payment timestamp cannot be in the future'; end if;
  v_evidence_key := lower(v_provider) || ':' || lower(v_reference);

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status not in ('pending_security','secured','pre_show') then
    raise exception 'Booking is not active for buyer payments';
  end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> p_booking_id
     or p.payment_type not in ('buyer_deposit','buyer_balance','buyer_full_payment')
     or p.payment_milestone_id is null or p.request_expires_at is null
     or p.booking_schedule_reservation_id is null then
    raise exception 'Complete buyer payment request was not found for booking';
  end if;
  select * into r from public.booking_schedule_reservations
  where id = p.booking_schedule_reservation_id for update;
  if not found or r.booking_id <> b.id or r.status not in ('held','secured') then
    raise exception 'Buyer payment requires the same booking active schedule reservation';
  end if;
  select * into m from public.payment_milestones where id = p.payment_milestone_id for update;
  if not found or m.booking_id <> b.id or m.party <> 'buyer' then
    raise exception 'Buyer payment milestone does not match request';
  end if;

  if p.status = 'paid' then
    if p.evidence_key = v_evidence_key and lower(coalesce(p.provider,'')) = lower(v_provider)
       and lower(coalesce(p.provider_reference,'')) = lower(v_reference) then
      return jsonb_build_object('paymentId',p.id,'status','paid','alreadyPaid',true,
        'receiptTiming',p.receipt_timing,'reconciliationStatus',p.reconciliation_status);
    end if;
    raise exception 'Paid payment already has different evidence';
  end if;
  if p.status <> 'pending' then raise exception 'Payment request is not pending'; end if;

  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  values (txid_current(),p.id,'record_evidence');
  if v_paid_at <= p.request_expires_at then
    update public.payments set provider = v_provider, provider_reference = v_reference,
      evidence_key = v_evidence_key, status = 'paid', paid_at = v_paid_at,
      receipt_timing = 'on_time', reconciliation_status = null, updated_at = now()
    where id = p.id and status = 'pending';
    if not found then raise exception 'Payment changed before evidence was recorded'; end if;
    update public.payment_milestones set status = 'paid', updated_at = now()
    where id = m.id and status in ('planned','due');
    if not found and m.status <> 'paid' then raise exception 'Payment milestone changed before payment was recorded'; end if;
    delete from public.ns_payment_transition_authorizations
    where transaction_id = txid_current() and payment_id = p.id and action = 'record_evidence';
    return jsonb_build_object('paymentId',p.id,'status','paid','alreadyPaid',false,
      'receiptTiming','on_time','reconciliationRequired',false,'paidAt',v_paid_at);
  end if;

  update public.payments set provider = v_provider, provider_reference = v_reference,
    evidence_key = v_evidence_key, status = 'pending', paid_at = v_paid_at,
    receipt_timing = 'late', reconciliation_status = 'pending', updated_at = now()
  where id = p.id and status = 'pending' and evidence_key is null;
  if not found then
    if p.receipt_timing = 'late' and p.reconciliation_status = 'pending'
       and p.evidence_key = v_evidence_key then
      delete from public.ns_payment_transition_authorizations
      where transaction_id = txid_current() and payment_id = p.id and action = 'record_evidence';
      return jsonb_build_object('paymentId',p.id,'status','pending_reconciliation',
        'alreadyRecorded',true,'receiptTiming','late','reconciliationRequired',true);
    end if;
    raise exception 'Payment request already has different evidence or state';
  end if;
  delete from public.ns_payment_transition_authorizations
  where transaction_id = txid_current() and payment_id = p.id and action = 'record_evidence';
  return jsonb_build_object('paymentId',p.id,'status','pending_reconciliation',
    'alreadyRecorded',false,'receiptTiming','late','reconciliationRequired',true,
    'paidAt',v_paid_at,'requestExpiredAt',p.request_expires_at);
end;
$$;

create or replace function public.ns_accept_late_buyer_transfer_v1(
  p_booking_id uuid,
  p_payment_id uuid,
  p_reconciled_by text,
  p_reconciliation_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  p public.payments%rowtype;
  r public.booking_schedule_reservations%rowtype;
  m public.payment_milestones%rowtype;
  v_now timestamptz := now();
begin
  if length(trim(coalesce(p_reconciled_by,''))) not between 3 and 200 then raise exception 'Reconciler identity is required'; end if;
  if length(trim(coalesce(p_reconciliation_note,''))) < 10 then raise exception 'Reconciliation decision note is required'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending_security' then raise exception 'Booking is not awaiting payment security'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> b.id or p.status <> 'pending'
     or p.receipt_timing <> 'late' or p.reconciliation_status <> 'pending'
     or p.paid_at is null or p.paid_at <= p.request_expires_at
     or coalesce(trim(p.evidence_key),'') = '' then
    raise exception 'Pending evidenced late buyer transfer was not found';
  end if;
  select * into r from public.booking_schedule_reservations
  where id = p.booking_schedule_reservation_id for update;
  if not found or r.booking_id <> b.id or r.status <> 'held' then
    raise exception 'Late transfer can be accepted only while the original slot remains held';
  end if;
  select * into m from public.payment_milestones where id = p.payment_milestone_id for update;
  if not found or m.booking_id <> b.id or m.party <> 'buyer' or m.status not in ('planned','due') then
    raise exception 'Buyer payment milestone is not reconcilable';
  end if;

  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  values (txid_current(),p.id,'accept_late');
  update public.payments set status = 'paid', reconciliation_status = 'accepted',
    reconciliation_note = trim(p_reconciliation_note), reconciled_at = v_now,
    reconciled_by = trim(p_reconciled_by), updated_at = v_now
  where id = p.id and status = 'pending' and reconciliation_status = 'pending';
  if not found then raise exception 'Late transfer changed before reconciliation completed'; end if;
  update public.payment_milestones set status = 'paid', updated_at = v_now
  where id = m.id and status in ('planned','due');
  if not found then raise exception 'Payment milestone changed before reconciliation completed'; end if;
  delete from public.ns_payment_transition_authorizations
  where transaction_id = txid_current() and payment_id = p.id and action = 'accept_late';

  -- Deliberately does not secure the booking. ns_secure_booking_v1 remains a
  -- separate transition and must validate this same reservation.
  return jsonb_build_object('paymentId',p.id,'status','paid','receiptTiming','late',
    'reconciliationStatus','accepted','bookingSecured',false,'reservationId',r.id);
end;
$$;

revoke all on function public.ns_create_buyer_payment_request_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ns_create_buyer_payment_request_v1(uuid,jsonb) to service_role;
revoke all on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) to service_role;
revoke all on function public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text) to service_role;
revoke all on function public.ns_guard_buyer_payment_cutoff_v1() from public, anon, authenticated;
revoke all on function public.ns_protect_payment_request_snapshot_v1() from public, anon, authenticated;

comment on column public.payments.request_expires_at is 'Immutable buyer payment cutoff instant resolved at 23:59:59 in the accepted event time zone.';
comment on column public.payments.receipt_timing is 'Whether verified transfer time was on or before the immutable cutoff.';
comment on column public.payments.reconciliation_status is 'Explicit admin decision state for evidenced transfers received after cutoff.';
comment on function public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text) is 'Accepts an evidenced late transfer while retaining the original held slot; does not secure the booking.';

commit;
