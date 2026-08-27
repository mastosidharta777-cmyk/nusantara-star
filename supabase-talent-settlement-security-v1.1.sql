-- Nusantara Star — Talent Settlement Security Patch V1.1
-- Run after supabase-operations-v1.sql.
-- Keeps talent settlement back-to-back with buyer cash by default.
-- Only an explicitly approved authorized_exception may allow Nusantara Star to advance funds.

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
  talent_paid_total bigint := 0;
  buyer_paid_total bigint := 0;
  result_row public.talent_settlements%rowtype;
  allow_advance boolean := false;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;
  if coalesce(trim(p_provider_reference), '') = '' then
    raise exception 'Settlement evidence/reference is required';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;

  select * into existing
  from public.talent_settlements
  where idempotency_key = p_idempotency_key;

  if found then
    if existing.booking_id <> p_booking_id or existing.amount <> p_amount then
      raise exception 'Idempotency key already used for a different settlement';
    end if;
    return existing;
  end if;

  select * into b
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','completed') then
    raise exception 'Booking is not eligible for talent settlement';
  end if;
  if b.talent_payable is null or b.talent_payable <= 0 then
    raise exception 'Talent payable is invalid';
  end if;

  if b.deal_id is not null then
    select * into d from public.deals where id = b.deal_id;
    if found and b.financial_security_type = 'authorized_exception' and d.exception_status = 'approved' then
      allow_advance := true;
    end if;
  end if;

  select coalesce(sum(amount), 0)::bigint into talent_paid_total
  from public.talent_settlements
  where booking_id = p_booking_id and status = 'paid';

  if talent_paid_total + p_amount > b.talent_payable then
    raise exception 'Settlement would exceed talent payable';
  end if;

  select coalesce(sum(amount), 0)::bigint into buyer_paid_total
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'
    and coalesce(payment_type, '') like 'buyer_%';

  if not allow_advance and talent_paid_total + p_amount > buyer_paid_total then
    raise exception 'Buyer cash received is insufficient for this talent settlement';
  end if;

  insert into public.talent_settlements (
    booking_id, amount, provider, provider_reference, idempotency_key, status, paid_at, notes
  ) values (
    p_booking_id, p_amount, nullif(trim(p_provider), ''), trim(p_provider_reference), trim(p_idempotency_key), 'paid', p_paid_at, p_notes
  )
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) to service_role;

comment on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) is
  'Atomic talent settlement gate. Prevents overpayment and, by default, prevents cumulative talent payouts from exceeding buyer cash actually received. Only an approved authorized_exception may allow advance funding.';
