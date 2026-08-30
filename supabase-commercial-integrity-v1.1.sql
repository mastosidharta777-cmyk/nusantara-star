-- Nusantara Star — Commercial Integrity V1.1
-- Run after supabase-commercial-integrity-v1.sql and supabase-cancellation-finance-v1.sql.
-- Extends buyer-payment evidence requirements into cancellation/refund/settlement and publishes readiness only at the final step.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'evidence_key'
  ) then
    raise exception 'Run supabase-commercial-integrity-v1.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'buyer_terms_accepted_deal_id'
  ) then
    raise exception 'Buyer acceptance evidence columns are missing';
  end if;
end;
$$;

create or replace function public.ns_approve_cancellation_v1(
  p_booking_id uuid,
  p_initiated_by text,
  p_reason text,
  p_buyer_refund_amount bigint,
  p_talent_due_amount bigint,
  p_decision_notes text,
  p_idempotency_key text
)
returns public.cancellation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  existing public.cancellation_cases%rowtype;
  buyer_paid_total bigint := 0;
  result_row public.cancellation_cases%rowtype;
begin
  if p_initiated_by not in ('buyer','talent','mutual','force_majeure','nusantara_star') then raise exception 'Invalid cancellation initiator'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cancellation reason is required'; end if;
  if p_buyer_refund_amount is null or p_buyer_refund_amount < 0 then raise exception 'Buyer refund amount is invalid'; end if;
  if p_talent_due_amount is null or p_talent_due_amount < 0 then raise exception 'Talent due amount is invalid'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.cancellation_cases where idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.booking_id <> p_booking_id or existing.buyer_refund_amount <> p_buyer_refund_amount or existing.talent_due_amount <> p_talent_due_amount then
      raise exception 'Idempotency key already used for a different cancellation decision';
    end if;
    return existing;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','incident') then raise exception 'Booking is not eligible for cancellation decision'; end if;
  if b.talent_payable is null or p_talent_due_amount > b.talent_payable then raise exception 'Talent due amount exceeds locked talent payable'; end if;

  select coalesce(sum(amount),0)::bigint into buyer_paid_total
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'
    and coalesce(payment_type,'') like 'buyer_%'
    and coalesce(trim(provider), '') <> ''
    and coalesce(trim(provider_reference), '') <> ''
    and coalesce(trim(evidence_key), '') <> '';

  if p_buyer_refund_amount > buyer_paid_total then raise exception 'Approved buyer refund exceeds evidenced buyer cash received'; end if;
  if exists (select 1 from public.cancellation_cases where booking_id = p_booking_id and status <> 'void') then raise exception 'An active cancellation case already exists for this booking'; end if;

  insert into public.cancellation_cases (
    booking_id, initiated_by, reason, status, buyer_refund_amount, talent_due_amount,
    decision_notes, idempotency_key, approved_at
  ) values (
    p_booking_id, p_initiated_by, trim(p_reason), 'approved', p_buyer_refund_amount, p_talent_due_amount,
    nullif(trim(p_decision_notes), ''), trim(p_idempotency_key), now()
  ) returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.ns_record_buyer_refund_v1(
  p_case_id uuid,
  p_payment_id uuid,
  p_amount bigint,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_refunded_at timestamptz default now(),
  p_notes text default null
)
returns public.buyer_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.cancellation_cases%rowtype;
  b public.bookings%rowtype;
  d public.deals%rowtype;
  p public.payments%rowtype;
  existing public.buyer_refunds%rowtype;
  payment_refunded bigint := 0;
  case_refunded bigint := 0;
  buyer_paid_total bigint := 0;
  buyer_refund_total bigint := 0;
  talent_gross bigint := 0;
  talent_reversed bigint := 0;
  allow_advance boolean := false;
  result_row public.buyer_refunds%rowtype;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Refund amount must be greater than zero'; end if;
  if coalesce(trim(p_provider_reference), '') = '' then raise exception 'Refund evidence/reference is required'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.buyer_refunds where idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.cancellation_case_id <> p_case_id or existing.payment_id <> p_payment_id or existing.amount <> p_amount then
      raise exception 'Idempotency key already used for a different refund';
    end if;
    return existing;
  end if;

  select * into c from public.cancellation_cases where id = p_case_id for update;
  if not found or c.status <> 'approved' then raise exception 'Cancellation case is not approved'; end if;
  select * into b from public.bookings where id = c.booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into p from public.payments where id = p_payment_id and booking_id = b.id;
  if not found
     or p.status <> 'paid'
     or coalesce(p.payment_type,'') not like 'buyer_%'
     or coalesce(trim(p.provider), '') = ''
     or coalesce(trim(p.provider_reference), '') = ''
     or coalesce(trim(p.evidence_key), '') = '' then
    raise exception 'Refund must reference an evidenced paid buyer payment';
  end if;

  select coalesce(sum(amount),0)::bigint into payment_refunded from public.buyer_refunds where payment_id = p.id;
  if payment_refunded + p_amount > p.amount then raise exception 'Refund exceeds referenced buyer payment'; end if;
  select coalesce(sum(amount),0)::bigint into case_refunded from public.buyer_refunds where cancellation_case_id = c.id;
  if case_refunded + p_amount > c.buyer_refund_amount then raise exception 'Refund exceeds approved cancellation amount'; end if;

  if b.deal_id is not null then
    select * into d from public.deals where id = b.deal_id;
    if found and b.financial_security_type = 'authorized_exception' and d.exception_status = 'approved' then allow_advance := true; end if;
  end if;

  select coalesce(sum(amount),0)::bigint into buyer_paid_total
  from public.payments
  where booking_id = b.id
    and status = 'paid'
    and coalesce(payment_type,'') like 'buyer_%'
    and coalesce(trim(provider), '') <> ''
    and coalesce(trim(provider_reference), '') <> ''
    and coalesce(trim(evidence_key), '') <> '';
  select coalesce(sum(amount),0)::bigint into buyer_refund_total from public.buyer_refunds where booking_id = b.id;
  select coalesce(sum(amount),0)::bigint into talent_gross from public.talent_settlements where booking_id = b.id;
  select coalesce(sum(amount),0)::bigint into talent_reversed from public.talent_settlement_reversals where booking_id = b.id;

  if not allow_advance and (buyer_paid_total - buyer_refund_total - p_amount) < (talent_gross - talent_reversed) then
    raise exception 'Refund would leave Nusantara Star funding talent from its own cash';
  end if;

  insert into public.buyer_refunds (
    booking_id, cancellation_case_id, payment_id, amount, provider, provider_reference,
    idempotency_key, refunded_at, notes
  ) values (
    b.id, c.id, p.id, p_amount, nullif(trim(p_provider),''), trim(p_provider_reference),
    trim(p_idempotency_key), p_refunded_at, p_notes
  ) returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.ns_record_talent_settlement_v1(
  p_booking_id uuid,
  p_amount bigint,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns public.talent_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  existing public.talent_settlements%rowtype;
  talent_gross bigint := 0;
  talent_reversed bigint := 0;
  buyer_paid_total bigint := 0;
  buyer_refund_total bigint := 0;
  result_row public.talent_settlements%rowtype;
  allow_advance boolean := false;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Settlement amount must be greater than zero'; end if;
  if coalesce(trim(p_provider_reference), '') = '' then raise exception 'Settlement evidence/reference is required'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.talent_settlements where idempotency_key = p_idempotency_key;
  if found then
    if existing.booking_id <> p_booking_id or existing.amount <> p_amount then raise exception 'Idempotency key already used for a different settlement'; end if;
    return existing;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','completed','incident') then raise exception 'Booking is not eligible for talent settlement'; end if;
  if b.talent_payable is null or b.talent_payable <= 0 then raise exception 'Talent payable is invalid'; end if;

  if b.deal_id is not null then
    select * into d from public.deals where id = b.deal_id;
    if found and b.financial_security_type = 'authorized_exception' and d.exception_status = 'approved' then allow_advance := true; end if;
  end if;

  select coalesce(sum(amount),0)::bigint into talent_gross from public.talent_settlements where booking_id = p_booking_id;
  select coalesce(sum(amount),0)::bigint into talent_reversed from public.talent_settlement_reversals where booking_id = p_booking_id;
  if talent_gross - talent_reversed + p_amount > b.talent_payable then raise exception 'Settlement would exceed talent payable'; end if;

  select coalesce(sum(amount),0)::bigint into buyer_paid_total
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'
    and coalesce(payment_type,'') like 'buyer_%'
    and coalesce(trim(provider), '') <> ''
    and coalesce(trim(provider_reference), '') <> ''
    and coalesce(trim(evidence_key), '') <> '';
  select coalesce(sum(amount),0)::bigint into buyer_refund_total from public.buyer_refunds where booking_id = p_booking_id;

  if not allow_advance and talent_gross - talent_reversed + p_amount > buyer_paid_total - buyer_refund_total then
    raise exception 'Net evidenced buyer cash received is insufficient for this talent settlement';
  end if;

  insert into public.talent_settlements (
    booking_id, amount, provider, provider_reference, idempotency_key, status, paid_at, notes
  ) values (
    p_booking_id, p_amount, nullif(trim(p_provider),''), trim(p_provider_reference), trim(p_idempotency_key), 'paid', p_paid_at, p_notes
  ) returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.ns_approve_cancellation_v1(uuid,text,text,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.ns_record_buyer_refund_v1(uuid,uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.ns_approve_cancellation_v1(uuid,text,text,bigint,bigint,text,text) to service_role;
grant execute on function public.ns_record_buyer_refund_v1(uuid,uuid,bigint,text,text,text,timestamptz,text) to service_role;
grant execute on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) to service_role;

create or replace function public.ns_commercial_integrity_ready_v1()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select true;
$$;

revoke all on function public.ns_commercial_integrity_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_commercial_integrity_ready_v1() to service_role;
comment on function public.ns_commercial_integrity_ready_v1() is 'Readiness marker created only after commercial-integrity V1 and evidence-aware downstream financial functions are installed.';

commit;
