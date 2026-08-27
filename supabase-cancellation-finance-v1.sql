-- Nusantara Star — Cancellation / Refund / Reversal Security V1
-- Run after supabase-talent-settlement-security-v1.1.sql.
-- Cancellation terms are human-approved. The database only enforces the approved financial decision and cash safety.

create table if not exists public.cancellation_cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  initiated_by text not null check (initiated_by in ('buyer','talent','mutual','force_majeure','nusantara_star')),
  reason text not null,
  status text not null default 'approved' check (status in ('approved','settled','void')),
  buyer_refund_amount bigint not null default 0 check (buyer_refund_amount >= 0),
  talent_due_amount bigint not null default 0 check (talent_due_amount >= 0),
  decision_notes text null,
  idempotency_key text not null unique,
  approved_at timestamptz not null default now(),
  settled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyer_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  cancellation_case_id uuid not null references public.cancellation_cases(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount bigint not null check (amount > 0),
  provider text null,
  provider_reference text not null,
  idempotency_key text not null unique,
  refunded_at timestamptz not null,
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists public.talent_settlement_reversals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  cancellation_case_id uuid not null references public.cancellation_cases(id) on delete restrict,
  settlement_id uuid not null references public.talent_settlements(id) on delete restrict,
  amount bigint not null check (amount > 0),
  provider text null,
  provider_reference text not null,
  idempotency_key text not null unique,
  reversed_at timestamptz not null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cancellation_cases_booking on public.cancellation_cases(booking_id);
create index if not exists idx_buyer_refunds_booking on public.buyer_refunds(booking_id);
create index if not exists idx_buyer_refunds_payment on public.buyer_refunds(payment_id);
create index if not exists idx_talent_reversals_booking on public.talent_settlement_reversals(booking_id);
create index if not exists idx_talent_reversals_settlement on public.talent_settlement_reversals(settlement_id);

alter table public.cancellation_cases enable row level security;
alter table public.buyer_refunds enable row level security;
alter table public.talent_settlement_reversals enable row level security;

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
  if p_initiated_by not in ('buyer','talent','mutual','force_majeure','nusantara_star') then
    raise exception 'Invalid cancellation initiator';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cancellation reason is required'; end if;
  if p_buyer_refund_amount is null or p_buyer_refund_amount < 0 then raise exception 'Buyer refund amount is invalid'; end if;
  if p_talent_due_amount is null or p_talent_due_amount < 0 then raise exception 'Talent due amount is invalid'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.cancellation_cases where idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.booking_id <> p_booking_id
       or existing.buyer_refund_amount <> p_buyer_refund_amount
       or existing.talent_due_amount <> p_talent_due_amount then
      raise exception 'Idempotency key already used for a different cancellation decision';
    end if;
    return existing;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','incident') then raise exception 'Booking is not eligible for cancellation decision'; end if;
  if b.talent_payable is null or p_talent_due_amount > b.talent_payable then
    raise exception 'Talent due amount exceeds locked talent payable';
  end if;

  select coalesce(sum(amount),0)::bigint into buyer_paid_total
  from public.payments
  where booking_id = p_booking_id and status = 'paid' and coalesce(payment_type,'') like 'buyer_%';

  if p_buyer_refund_amount > buyer_paid_total then
    raise exception 'Approved buyer refund exceeds buyer cash received';
  end if;

  if exists (select 1 from public.cancellation_cases where booking_id = p_booking_id and status <> 'void') then
    raise exception 'An active cancellation case already exists for this booking';
  end if;

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
  if not found or p.status <> 'paid' or coalesce(p.payment_type,'') not like 'buyer_%' then
    raise exception 'Refund must reference a paid buyer payment';
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
  from public.payments where booking_id = b.id and status = 'paid' and coalesce(payment_type,'') like 'buyer_%';
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

create or replace function public.ns_reverse_talent_settlement_v1(
  p_case_id uuid,
  p_settlement_id uuid,
  p_amount bigint,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_reversed_at timestamptz default now(),
  p_notes text default null
)
returns public.talent_settlement_reversals
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.cancellation_cases%rowtype;
  s public.talent_settlements%rowtype;
  existing public.talent_settlement_reversals%rowtype;
  already_reversed bigint := 0;
  result_row public.talent_settlement_reversals%rowtype;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Reversal amount must be greater than zero'; end if;
  if coalesce(trim(p_provider_reference), '') = '' then raise exception 'Reversal evidence/reference is required'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.talent_settlement_reversals where idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.cancellation_case_id <> p_case_id or existing.settlement_id <> p_settlement_id or existing.amount <> p_amount then
      raise exception 'Idempotency key already used for a different reversal';
    end if;
    return existing;
  end if;

  select * into c from public.cancellation_cases where id = p_case_id for update;
  if not found or c.status <> 'approved' then raise exception 'Cancellation case is not approved'; end if;
  select * into s from public.talent_settlements where id = p_settlement_id and booking_id = c.booking_id for update;
  if not found then raise exception 'Talent settlement not found'; end if;

  select coalesce(sum(amount),0)::bigint into already_reversed
  from public.talent_settlement_reversals where settlement_id = s.id;
  if already_reversed + p_amount > s.amount then raise exception 'Reversal exceeds original talent settlement'; end if;

  insert into public.talent_settlement_reversals (
    booking_id, cancellation_case_id, settlement_id, amount, provider, provider_reference,
    idempotency_key, reversed_at, notes
  ) values (
    c.booking_id, c.id, s.id, p_amount, nullif(trim(p_provider),''), trim(p_provider_reference),
    trim(p_idempotency_key), p_reversed_at, p_notes
  ) returning * into result_row;

  if already_reversed + p_amount = s.amount then
    update public.talent_settlements set status = 'reversed', reversed_at = p_reversed_at where id = s.id;
  end if;
  return result_row;
end;
$$;

create or replace function public.ns_finalize_cancellation_v1(p_case_id uuid)
returns public.cancellation_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.cancellation_cases%rowtype;
  b public.bookings%rowtype;
  refund_total bigint := 0;
  talent_gross bigint := 0;
  talent_reversed bigint := 0;
  result_row public.cancellation_cases%rowtype;
begin
  select * into c from public.cancellation_cases where id = p_case_id for update;
  if not found then raise exception 'Cancellation case not found'; end if;
  if c.status = 'settled' then return c; end if;
  if c.status <> 'approved' then raise exception 'Cancellation case is not approved'; end if;

  select * into b from public.bookings where id = c.booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  select coalesce(sum(amount),0)::bigint into refund_total from public.buyer_refunds where cancellation_case_id = c.id;
  select coalesce(sum(amount),0)::bigint into talent_gross from public.talent_settlements where booking_id = b.id;
  select coalesce(sum(amount),0)::bigint into talent_reversed from public.talent_settlement_reversals where booking_id = b.id;

  if refund_total <> c.buyer_refund_amount then raise exception 'Buyer refund reconciliation is incomplete'; end if;
  if talent_gross - talent_reversed <> c.talent_due_amount then raise exception 'Talent settlement reconciliation is incomplete'; end if;

  update public.bookings set status = 'cancelled', updated_at = now() where id = b.id;
  update public.briefs set status = 'cancelled', updated_at = now() where id = b.brief_id;
  update public.cancellation_cases set status = 'settled', settled_at = now(), updated_at = now() where id = c.id returning * into result_row;
  return result_row;
end;
$$;

-- Replaces the settlement gate so subsequent payouts use net buyer cash and net talent paid after refunds/reversals.
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
    if existing.booking_id <> p_booking_id or existing.amount <> p_amount then
      raise exception 'Idempotency key already used for a different settlement';
    end if;
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
  from public.payments where booking_id = p_booking_id and status = 'paid' and coalesce(payment_type,'') like 'buyer_%';
  select coalesce(sum(amount),0)::bigint into buyer_refund_total from public.buyer_refunds where booking_id = p_booking_id;

  if not allow_advance and talent_gross - talent_reversed + p_amount > buyer_paid_total - buyer_refund_total then
    raise exception 'Net buyer cash received is insufficient for this talent settlement';
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
revoke all on function public.ns_reverse_talent_settlement_v1(uuid,uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.ns_finalize_cancellation_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;

grant execute on function public.ns_approve_cancellation_v1(uuid,text,text,bigint,bigint,text,text) to service_role;
grant execute on function public.ns_record_buyer_refund_v1(uuid,uuid,bigint,text,text,text,timestamptz,text) to service_role;
grant execute on function public.ns_reverse_talent_settlement_v1(uuid,uuid,bigint,text,text,text,timestamptz,text) to service_role;
grant execute on function public.ns_finalize_cancellation_v1(uuid) to service_role;
grant execute on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) to service_role;

comment on table public.cancellation_cases is 'Human-approved cancellation financial decision. No refund or talent amount is inferred automatically.';
comment on table public.buyer_refunds is 'Actual buyer refund ledger. Original buyer payments remain immutable receipt history.';
comment on table public.talent_settlement_reversals is 'Actual reversals/recoveries of talent settlement amounts.';
