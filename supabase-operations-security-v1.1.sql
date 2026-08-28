-- Nusantara Star — Phase 5/6 final booking security patch
-- Run after supabase-operations-security-v1.sql.
-- Tightens the final secured-booking gate so an unresolved funding gap can never be bypassed.

create or replace function public.ns_secure_booking_v1(p_booking_id uuid)
returns table (
  booking_status text,
  financial_security_type text,
  paid_buyer_total bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  o public.talent_offers%rowtype;
  m public.payment_milestones%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_security_type text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pending_security' then raise exception 'Booking is not pending security'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;

  select * into d from public.deals where id = b.deal_id;
  if not found or d.status <> 'locked' then raise exception 'Deal is not locked'; end if;
  if d.talent_terms_status <> 'confirmed' then raise exception 'Talent terms are unresolved'; end if;
  if b.buyer_terms_accepted_at is null or d.buyer_terms_status <> 'accepted' then raise exception 'Buyer terms are not accepted'; end if;
  if d.funding_gap_status <> 'safe' then raise exception 'Funding gap is unresolved'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
    raise exception 'Talent offer requires reconfirmation';
  end if;
  if o.quote_valid_until is not null and o.quote_valid_until <= now() then
    raise exception 'Talent offer has expired';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where booking_id = b.id and status = 'paid';

  if b.financial_security_status = 'satisfied'
     and b.financial_security_type in ('approved_po_credit','authorized_exception') then
    if b.financial_security_type = 'approved_po_credit'
       and coalesce(trim(b.financial_security_reference), '') = '' then
      raise exception 'PO/credit reference is required';
    end if;
    if b.financial_security_type = 'authorized_exception'
       and d.exception_status <> 'approved' then
      raise exception 'Commercial exception is not approved';
    end if;
    v_security_type := b.financial_security_type;
  elsif b.buyer_price > 0 and v_paid >= b.buyer_price then
    v_security_type := 'full_payment_received';
  else
    select * into m
    from public.payment_milestones
    where booking_id = b.id and party = 'buyer'
    order by sequence_no asc
    limit 1;

    if not found then raise exception 'Buyer payment milestones are missing'; end if;

    if m.calculation_type = 'percentage' then
      v_required := round(b.buyer_price * (coalesce(m.percentage, 0) / 100.0));
    elsif m.calculation_type = 'fixed_amount' then
      v_required := coalesce(m.amount, 0);
    else
      v_required := b.buyer_price;
    end if;

    if v_required <= 0 or v_paid < v_required then
      raise exception 'Financial security condition is not satisfied';
    end if;
    v_security_type := 'deposit_received';
  end if;

  update public.bookings
  set status = 'secured',
      financial_security_type = v_security_type,
      financial_security_status = 'satisfied',
      secured_at = now(),
      updated_at = now()
  where id = b.id and status = 'pending_security';

  if not found then raise exception 'Booking security transition lost a concurrent update'; end if;

  update public.briefs
  set status = 'booked'
  where id = b.brief_id and status in ('buyer_selected','terms_agreed');

  return query
  select 'secured'::text, v_security_type::text, v_paid::bigint;
end;
$$;

revoke all on function public.ns_secure_booking_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_secure_booking_v1(uuid) to service_role;

comment on function public.ns_secure_booking_v1(uuid) is 'Atomic final gate for pending_security -> secured. Requires locked deal, accepted terms, current confirmed offer, funding_gap_status=safe, and valid financial security.';
