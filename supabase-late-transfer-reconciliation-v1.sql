-- Nusantara Star — late buyer transfer reconciliation + post-security payment requests V1
-- Run after supabase-booking-reservation-security-v1.sql.
-- Keeps transfer evidence immutable, makes acceptance/rejection auditable, and
-- permits locked milestone payment requests after the booking is already secured.

begin;

create table if not exists public.buyer_payment_returns (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  amount bigint not null check (amount > 0),
  provider text not null,
  provider_reference text not null,
  returned_at timestamptz not null,
  recorded_by text not null,
  reconciliation_note text not null,
  created_at timestamptz not null default now(),
  constraint buyer_payment_returns_audit_check check (
    length(trim(provider)) >= 2
    and length(trim(provider_reference)) >= 3
    and length(trim(recorded_by)) between 3 and 200
    and length(trim(reconciliation_note)) >= 10
  )
);
create index if not exists idx_buyer_payment_returns_booking
  on public.buyer_payment_returns(booking_id, returned_at desc);
alter table public.buyer_payment_returns enable row level security;
revoke all on table public.buyer_payment_returns from public, anon, authenticated, service_role;

create or replace function public.ns_protect_buyer_payment_return_v1()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'Late-transfer return evidence is immutable'; end; $$;
drop trigger if exists trg_protect_buyer_payment_return_v1 on public.buyer_payment_returns;
create trigger trg_protect_buyer_payment_return_v1
before update or delete on public.buyer_payment_returns
for each row execute function public.ns_protect_buyer_payment_return_v1();

alter table public.ns_payment_transition_authorizations
  drop constraint if exists ns_payment_transition_authorizations_action_check;
alter table public.ns_payment_transition_authorizations
  add constraint ns_payment_transition_authorizations_action_check
  check (action in ('create_request','record_evidence','accept_late','reject_late','cancel_request'));

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
         and a.action in ('record_evidence','accept_late','reject_late','cancel_request')
     ) then
    raise exception 'Buyer payment evidence, status and reconciliation must use an authorized RPC';
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
  if not found or b.status not in ('pending_security','secured','pre_show')
     or b.buyer_terms_accepted_at is null
     or b.buyer_terms_accepted_deal_id is distinct from b.deal_id
     or b.buyer_terms_acceptance_source is distinct from 'signed_buyer_link'
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Active booking with accepted buyer terms is required for a buyer payment request';
  end if;

  select * into r from public.booking_schedule_reservations
  where id = new.booking_schedule_reservation_id;
  if not found or r.booking_id <> new.booking_id then
    raise exception 'Buyer payment request requires the same booking schedule reservation';
  end if;
  if b.status = 'pending_security' and r.status <> 'held' then
    raise exception 'Pending-security payment requires the live held reservation';
  end if;
  if b.status in ('secured','pre_show') and r.status <> 'secured' then
    raise exception 'Post-security payment requires the secured reservation';
  end if;

  if tg_op = 'INSERT' and b.status = 'pending_security'
     and (new.request_expires_at > r.hold_expires_at or new.request_expires_at > r.offer_valid_until) then
    raise exception 'Initial payment request cutoff cannot outlive the hold or offer';
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
  v_expected_reservation_status text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending_security','secured','pre_show') then
    raise exception 'Booking is not active for buyer payment requests';
  end if;
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
     or pi.show_timezone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura') then
    raise exception 'Exact proposal, talent offer and event time zone are required for payment';
  end if;
  if b.status = 'pending_security' and (
      o.status <> 'confirmed' or o.availability_status <> 'confirmed'
      or o.quote_valid_until is null or o.quote_valid_until <= v_now
  ) then
    raise exception 'Talent offer requires reconfirmation before initial payment';
  end if;
  v_event_timezone := pi.show_timezone;

  v_expected_reservation_status := case when b.status='pending_security' then 'held' else 'secured' end;
  select * into r from public.booking_schedule_reservations
  where booking_id = b.id and status = v_expected_reservation_status for update;
  if not found or r.deal_id <> d.id or r.proposal_item_id <> pi.id or r.talent_offer_id <> o.id then
    raise exception 'Exact active reservation for the booking was not found';
  end if;
  if b.status='pending_security' and (r.hold_expires_at <= v_now or r.offer_valid_until <= v_now) then
    raise exception 'Initial payment requires the exact live held reservation';
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
        if existing.status='pending' and existing.receipt_timing='late'
           and existing.reconciliation_status='pending' then
          raise exception 'Late transfer reconciliation must be resolved before another request is issued';
        end if;
        if existing.status='pending' and existing.request_expires_at <= v_now
           and existing.evidence_key is null and existing.paid_at is null
           and existing.receipt_timing is null and existing.reconciliation_status is null then
          insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
          values(txid_current(),existing.id,'cancel_request');
          update public.payments set status='cancelled',updated_at=v_now
          where id=existing.id and status='pending';
          if not found then raise exception 'Expired payment request changed before it could be retired'; end if;
          delete from public.ns_payment_transition_authorizations
          where transaction_id=txid_current() and payment_id=existing.id and action='cancel_request';
        elsif existing.booking_schedule_reservation_id = r.id
           and existing.request_expires_at > v_now then
          return existing;
        else
          raise exception 'Existing payment request has unresolved evidence or incompatible reservation state';
        end if;
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
  if v_request_expires_at <= v_now then
    raise exception 'Payment milestone due date is already past; manual commercial resolution is required';
  end if;
  if b.status='pending_security' and (
      v_request_expires_at > r.hold_expires_at or v_request_expires_at > r.offer_valid_until
  ) then
    raise exception 'Initial payment cutoff requires a hold and offer valid through 23:59:59 on the due date';
  end if;

  v_reference := 'NS-PR-' || to_char(v_now at time zone 'Asia/Jakarta','YYMMDD') || '-'
    || upper(substr(replace(v_payment_id::text,'-',''),1,8));
  v_snapshot := jsonb_build_object(
    'schema_version', 3, 'request_reference', v_reference, 'booking_id', b.id,
    'deal_id', b.deal_id, 'payment_milestone_id', m.id,
    'booking_schedule_reservation_id', r.id, 'payment_type', v_payment_type,
    'currency', 'IDR', 'amount', v_resolved, 'issued_at', v_now,
    'due_date', v_due_date, 'expires_at', v_request_expires_at,
    'event_timezone', v_event_timezone, 'booking_status_at_issue', b.status,
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
  v_actor text := trim(coalesce(p_reconciled_by,''));
  v_note text := trim(coalesce(p_reconciliation_note,''));
  v_now timestamptz := now();
begin
  if length(v_actor) not between 3 and 200 then raise exception 'Reconciler identity is required'; end if;
  if length(v_note) < 10 then raise exception 'Reconciliation decision note is required'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status not in ('pending_security','secured','pre_show') then
    raise exception 'Booking is not active for buyer payment reconciliation';
  end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> b.id then raise exception 'Buyer payment was not found for booking'; end if;

  if p.status='paid' and p.receipt_timing='late' and p.reconciliation_status='accepted' then
    if p.reconciled_by is distinct from v_actor or p.reconciliation_note is distinct from v_note then
      raise exception 'Late-transfer acceptance retry audit differs from the recorded decision';
    end if;
    return jsonb_build_object('paymentId',p.id,'status','paid','receiptTiming','late',
      'reconciliationStatus','accepted','alreadyReconciled',true,'bookingSecured',false,
      'reservationId',p.booking_schedule_reservation_id);
  end if;

  if p.status <> 'pending' or p.receipt_timing <> 'late' or p.reconciliation_status <> 'pending'
     or p.paid_at is null or p.paid_at <= p.request_expires_at
     or coalesce(trim(p.evidence_key),'') = '' then
    raise exception 'Pending evidenced late buyer transfer was not found';
  end if;
  select * into r from public.booking_schedule_reservations
  where id = p.booking_schedule_reservation_id for update;
  if not found or r.booking_id <> b.id
     or (b.status='pending_security' and r.status<>'held')
     or (b.status in ('secured','pre_show') and r.status<>'secured') then
    raise exception 'Late transfer requires the exact active booking reservation';
  end if;
  select * into m from public.payment_milestones where id = p.payment_milestone_id for update;
  if not found or m.booking_id <> b.id or m.party <> 'buyer' or m.status not in ('planned','due') then
    raise exception 'Buyer payment milestone is not reconcilable';
  end if;

  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  values (txid_current(),p.id,'accept_late');
  update public.payments set status = 'paid', reconciliation_status = 'accepted',
    reconciliation_note = v_note, reconciled_at = v_now,
    reconciled_by = v_actor, updated_at = v_now
  where id = p.id and status = 'pending' and reconciliation_status = 'pending';
  if not found then raise exception 'Late transfer changed before reconciliation completed'; end if;
  update public.payment_milestones set status = 'paid', updated_at = v_now
  where id = m.id and status in ('planned','due');
  if not found then raise exception 'Payment milestone changed before reconciliation completed'; end if;
  delete from public.ns_payment_transition_authorizations
  where transaction_id = txid_current() and payment_id = p.id and action = 'accept_late';

  return jsonb_build_object('paymentId',p.id,'status','paid','receiptTiming','late',
    'reconciliationStatus','accepted','alreadyReconciled',false,'bookingSecured',false,
    'reservationId',r.id);
end;
$$;

create or replace function public.ns_reject_late_buyer_transfer_v1(
  p_booking_id uuid,
  p_payment_id uuid,
  p_reconciled_by text,
  p_reconciliation_note text,
  p_return_provider text,
  p_return_reference text,
  p_returned_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  p public.payments%rowtype;
  r public.booking_schedule_reservations%rowtype;
  existing_return public.buyer_payment_returns%rowtype;
  v_actor text := trim(coalesce(p_reconciled_by,''));
  v_note text := trim(coalesce(p_reconciliation_note,''));
  v_provider text := trim(coalesce(p_return_provider,''));
  v_reference text := trim(coalesce(p_return_reference,''));
  v_returned_at timestamptz := coalesce(p_returned_at, now());
  v_now timestamptz := now();
begin
  if length(v_actor) not between 3 and 200 then raise exception 'Reconciler identity is required'; end if;
  if length(v_note) < 10 then raise exception 'Reconciliation decision note is required'; end if;
  if length(v_provider) < 2 or length(v_reference) < 3 then
    raise exception 'Return provider and transaction reference are required';
  end if;
  if v_returned_at > v_now + interval '10 minutes' then raise exception 'Return timestamp cannot be in the future'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status not in ('pending_security','secured','pre_show') then
    raise exception 'Booking is not active for buyer payment reconciliation';
  end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> b.id then raise exception 'Buyer payment was not found for booking'; end if;

  if p.status='refunded' and p.receipt_timing='late' and p.reconciliation_status='rejected' then
    select * into existing_return from public.buyer_payment_returns where payment_id=p.id;
    if not found
       or p.reconciled_by is distinct from v_actor
       or p.reconciliation_note is distinct from v_note
       or lower(existing_return.provider) is distinct from lower(v_provider)
       or lower(existing_return.provider_reference) is distinct from lower(v_reference) then
      raise exception 'Late-transfer rejection retry audit differs from the recorded return';
    end if;
    return jsonb_build_object('paymentId',p.id,'status','refunded','receiptTiming','late',
      'reconciliationStatus','rejected','alreadyReconciled',true,'bookingSecured',false,
      'returnId',existing_return.id,'reservationId',p.booking_schedule_reservation_id);
  end if;

  if p.status <> 'pending' or p.receipt_timing <> 'late' or p.reconciliation_status <> 'pending'
     or p.paid_at is null or p.paid_at <= p.request_expires_at
     or coalesce(trim(p.evidence_key),'') = '' then
    raise exception 'Pending evidenced late buyer transfer was not found';
  end if;
  select * into r from public.booking_schedule_reservations
  where id = p.booking_schedule_reservation_id for update;
  if not found or r.booking_id <> b.id
     or (b.status='pending_security' and r.status<>'held')
     or (b.status in ('secured','pre_show') and r.status<>'secured') then
    raise exception 'Late transfer requires the exact active booking reservation';
  end if;

  insert into public.ns_payment_transition_authorizations(transaction_id,payment_id,action)
  values (txid_current(),p.id,'reject_late');
  insert into public.buyer_payment_returns(
    booking_id,payment_id,amount,provider,provider_reference,returned_at,recorded_by,reconciliation_note
  ) values(
    b.id,p.id,p.amount,v_provider,v_reference,v_returned_at,v_actor,v_note
  ) returning * into existing_return;

  update public.payments set status='refunded',reconciliation_status='rejected',
    reconciliation_note=v_note,reconciled_at=v_now,reconciled_by=v_actor,updated_at=v_now
  where id=p.id and status='pending' and reconciliation_status='pending';
  if not found then raise exception 'Late transfer changed before rejection completed'; end if;
  delete from public.ns_payment_transition_authorizations
  where transaction_id=txid_current() and payment_id=p.id and action='reject_late';

  return jsonb_build_object('paymentId',p.id,'status','refunded','receiptTiming','late',
    'reconciliationStatus','rejected','alreadyReconciled',false,'bookingSecured',false,
    'returnId',existing_return.id,'reservationId',r.id);
end;
$$;

create or replace function public.ns_late_transfer_reconciliation_ready_v1()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select to_regclass('public.buyer_payment_returns') is not null
    and to_regprocedure('public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text)') is not null
    and to_regprocedure('public.ns_reject_late_buyer_transfer_v1(uuid,uuid,text,text,text,text,timestamptz)') is not null;
$$;

revoke all on function public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ns_accept_late_buyer_transfer_v1(uuid,uuid,text,text) to service_role;
revoke all on function public.ns_reject_late_buyer_transfer_v1(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ns_reject_late_buyer_transfer_v1(uuid,uuid,text,text,text,text,timestamptz) to service_role;
revoke all on function public.ns_late_transfer_reconciliation_ready_v1() from public,anon,authenticated;
grant execute on function public.ns_late_transfer_reconciliation_ready_v1() to service_role;
revoke all on function public.ns_protect_buyer_payment_return_v1() from public,anon,authenticated;

comment on table public.buyer_payment_returns is
  'Immutable evidence that a verified late buyer transfer was returned before reconciliation was closed as rejected.';
comment on function public.ns_reject_late_buyer_transfer_v1(uuid,uuid,text,text,text,text,timestamptz) is
  'Atomically records full return evidence and closes a late buyer transfer as rejected/refunded without securing the booking.';

commit;
