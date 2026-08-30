-- Nusantara Star — Commercial Integrity V1
-- Run after supabase-operations-security-v1.1.sql and supabase-atomic-selection-availability-v1.sql.
-- Locks buyer acceptance evidence, buyer payment evidence, and expiry requirements at database level.

alter table public.bookings
  add column if not exists buyer_terms_accepted_deal_id uuid null references public.deals(id) on delete restrict,
  add column if not exists buyer_terms_acceptance_source text null;

alter table public.payments
  add column if not exists evidence_key text null;

create unique index if not exists idx_payments_evidence_key
  on public.payments(evidence_key)
  where evidence_key is not null;

alter table public.bookings drop constraint if exists bookings_buyer_terms_acceptance_evidence;
alter table public.bookings add constraint bookings_buyer_terms_acceptance_evidence
  check (
    buyer_terms_accepted_at is null
    or (
      buyer_terms_accepted_deal_id is not null
      and buyer_terms_accepted_deal_id = deal_id
      and buyer_terms_acceptance_source = 'signed_buyer_link'
    )
  ) not valid;

alter table public.payments drop constraint if exists payments_paid_requires_evidence;
alter table public.payments add constraint payments_paid_requires_evidence
  check (
    status <> 'paid'
    or (
      coalesce(trim(provider), '') <> ''
      and coalesce(trim(provider_reference), '') <> ''
      and coalesce(trim(evidence_key), '') <> ''
    )
  ) not valid;

alter table public.talent_offers drop constraint if exists talent_offers_confirmed_requires_expiry;
alter table public.talent_offers add constraint talent_offers_confirmed_requires_expiry
  check (status <> 'confirmed' or quote_valid_until is not null) not valid;

alter table public.proposals drop constraint if exists proposals_active_requires_expiry;
alter table public.proposals add constraint proposals_active_requires_expiry
  check (status not in ('sent','viewed','selected') or expires_at is not null) not valid;

alter table public.proposal_items drop constraint if exists proposal_items_confirmed_requires_expiry;
alter table public.proposal_items add constraint proposal_items_confirmed_requires_expiry
  check (availability_status <> 'confirmed' or offer_valid_until is not null) not valid;

create or replace function public.ns_accept_buyer_terms_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  o public.talent_offers%rowtype;
  v_now timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;

  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.brief_id <> b.brief_id or d.status <> 'locked' then raise exception 'Deal is not locked'; end if;

  if b.buyer_terms_accepted_at is not null
     and b.buyer_terms_accepted_deal_id = d.id
     and b.buyer_terms_acceptance_source = 'signed_buyer_link'
     and d.buyer_terms_status = 'accepted' then
    return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', b.buyer_terms_accepted_at, 'alreadyAccepted', true);
  end if;

  if b.status <> 'pending_security' then raise exception 'Booking is no longer awaiting buyer terms'; end if;
  if jsonb_typeof(d.buyer_payment_schedule) <> 'array' or jsonb_array_length(d.buyer_payment_schedule) = 0 then raise exception 'Buyer payment schedule is missing'; end if;
  if coalesce(trim(d.cancellation_terms), '') = '' then raise exception 'Buyer cancellation terms are missing'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then raise exception 'Talent offer requires reconfirmation'; end if;
  if o.quote_valid_until is null or o.quote_valid_until <= v_now then raise exception 'Talent offer has expired or has no validity'; end if;

  update public.bookings
  set buyer_terms_accepted_at = v_now,
      buyer_terms_accepted_deal_id = d.id,
      buyer_terms_acceptance_source = 'signed_buyer_link',
      updated_at = v_now
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Buyer terms acceptance lost a concurrent update'; end if;

  update public.deals
  set buyer_terms_status = 'accepted', updated_at = v_now
  where id = d.id and status = 'locked';
  if not found then raise exception 'Deal changed before buyer acceptance'; end if;

  update public.briefs
  set status = 'terms_agreed', updated_at = v_now
  where id = b.brief_id and status = 'buyer_selected';

  return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', v_now, 'alreadyAccepted', false, 'source', 'signed_buyer_link');
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
  v_provider text := trim(coalesce(p_provider, ''));
  v_reference text := trim(coalesce(p_provider_reference, ''));
  v_evidence_key text;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if v_provider = '' or v_reference = '' then raise exception 'Payment provider and transaction reference are required'; end if;
  if v_paid_at > now() + interval '10 minutes' then raise exception 'Payment timestamp cannot be in the future'; end if;
  v_evidence_key := lower(v_provider) || ':' || lower(v_reference);

  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending_security','secured','pre_show') then raise exception 'Booking is not active for buyer payments'; end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> p_booking_id then raise exception 'Payment does not belong to booking'; end if;

  if p.status = 'paid' then
    if p.evidence_key = v_evidence_key and lower(coalesce(p.provider,'')) = lower(v_provider) and lower(coalesce(p.provider_reference,'')) = lower(v_reference) then
      return jsonb_build_object('paymentId', p.id, 'status', 'paid', 'alreadyPaid', true, 'evidenceKey', v_evidence_key);
    end if;
    if coalesce(trim(p.provider), '') = '' or coalesce(trim(p.provider_reference), '') = '' or coalesce(trim(p.evidence_key), '') = '' then
      update public.payments
      set provider = v_provider, provider_reference = v_reference, evidence_key = v_evidence_key, paid_at = coalesce(p.paid_at, v_paid_at), updated_at = now()
      where id = p.id and status = 'paid';
      return jsonb_build_object('paymentId', p.id, 'status', 'paid', 'alreadyPaid', true, 'evidenceRepaired', true, 'evidenceKey', v_evidence_key);
    end if;
    raise exception 'Paid payment already has different evidence';
  end if;

  if p.status <> 'pending' then raise exception 'Payment is not pending'; end if;

  update public.payments
  set provider = v_provider,
      provider_reference = v_reference,
      evidence_key = v_evidence_key,
      status = 'paid',
      paid_at = v_paid_at,
      updated_at = now()
  where id = p.id and status = 'pending';
  if not found then raise exception 'Payment changed before evidence was recorded'; end if;

  return jsonb_build_object('paymentId', p.id, 'status', 'paid', 'alreadyPaid', false, 'evidenceKey', v_evidence_key, 'paidAt', v_paid_at);
end;
$$;

create or replace function public.ns_select_buyer_talent_v1(
  p_brief_id uuid,
  p_talent_id uuid,
  p_proposal_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
  v_item public.proposal_items%rowtype;
  v_proposal public.proposals%rowtype;
  v_existing public.buyer_selections%rowtype;
  v_now timestamptz := now();
begin
  select * into v_brief from public.briefs where id = p_brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if v_brief.status not in ('proposal_sent','buyer_selected') then raise exception 'Brief is not ready for buyer selection'; end if;

  select * into v_item from public.proposal_items where id = p_proposal_item_id and brief_id = p_brief_id and talent_id = p_talent_id;
  if not found then raise exception 'Talent is not part of this proposal snapshot'; end if;
  if v_item.availability_status <> 'confirmed' then raise exception 'Talent availability is not confirmed'; end if;
  if v_item.offer_valid_until is null or v_item.offer_valid_until <= v_now then raise exception 'Talent offer has expired or has no validity'; end if;

  select * into v_proposal from public.proposals where id = v_item.proposal_id for update;
  if not found or v_proposal.brief_id <> p_brief_id or v_proposal.status not in ('sent','viewed','selected') then raise exception 'Proposal is not selectable'; end if;
  if v_proposal.expires_at is null or v_proposal.expires_at <= v_now then raise exception 'Proposal has expired or has no validity'; end if;

  select * into v_existing from public.buyer_selections where brief_id = p_brief_id for update;
  if found then
    if v_existing.talent_id <> p_talent_id then raise exception 'A talent selection is already recorded'; end if;
    if v_existing.status <> 'selected' then update public.buyer_selections set status = 'selected', selected_at = v_now, updated_at = v_now where id = v_existing.id; end if;
    if v_brief.status = 'proposal_sent' then update public.briefs set status = 'buyer_selected', updated_at = v_now where id = p_brief_id; end if;
    if v_proposal.status <> 'selected' then update public.proposals set status = 'selected', updated_at = v_now where id = v_proposal.id; end if;
    return jsonb_build_object('briefId', p_brief_id, 'talentId', p_talent_id, 'proposalId', v_proposal.id, 'proposalItemId', p_proposal_item_id, 'status', 'buyer_selected', 'alreadySelected', true);
  end if;

  insert into public.buyer_selections (brief_id, talent_id, status, selected_at, updated_at) values (p_brief_id, p_talent_id, 'selected', v_now, v_now);
  update public.briefs set status = 'buyer_selected', updated_at = v_now where id = p_brief_id;
  update public.proposals set status = 'selected', updated_at = v_now where id = v_proposal.id;
  return jsonb_build_object('briefId', p_brief_id, 'talentId', p_talent_id, 'proposalId', v_proposal.id, 'proposalItemId', p_proposal_item_id, 'status', 'buyer_selected', 'alreadySelected', false);
end;
$$;

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
  if b.buyer_terms_accepted_at is null or d.buyer_terms_status <> 'accepted' or b.buyer_terms_accepted_deal_id <> b.deal_id or b.buyer_terms_acceptance_source <> 'signed_buyer_link' then raise exception 'Buyer terms are not verified as accepted'; end if;
  if d.funding_gap_status <> 'safe' then raise exception 'Funding gap is unresolved'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then raise exception 'Talent offer requires reconfirmation'; end if;
  if o.quote_valid_until is null or o.quote_valid_until <= now() then raise exception 'Talent offer has expired or has no validity'; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where booking_id = b.id
    and status = 'paid'
    and coalesce(trim(provider), '') <> ''
    and coalesce(trim(provider_reference), '') <> ''
    and coalesce(trim(evidence_key), '') <> '';

  if b.financial_security_status = 'satisfied' and b.financial_security_type in ('approved_po_credit','authorized_exception') then
    if b.financial_security_type = 'approved_po_credit' and coalesce(trim(b.financial_security_reference), '') = '' then raise exception 'PO/credit reference is required'; end if;
    if b.financial_security_type = 'authorized_exception' and d.exception_status <> 'approved' then raise exception 'Commercial exception is not approved'; end if;
    v_security_type := b.financial_security_type;
  elsif b.buyer_price > 0 and v_paid >= b.buyer_price then
    v_security_type := 'full_payment_received';
  else
    select * into m from public.payment_milestones where booking_id = b.id and party = 'buyer' order by sequence_no asc limit 1;
    if not found then raise exception 'Buyer payment milestones are missing'; end if;
    if m.calculation_type = 'percentage' then v_required := round(b.buyer_price * (coalesce(m.percentage, 0) / 100.0));
    elsif m.calculation_type = 'fixed_amount' then v_required := coalesce(m.amount, 0);
    else v_required := b.buyer_price;
    end if;
    if v_required <= 0 or v_paid < v_required then raise exception 'Financial security condition is not satisfied'; end if;
    v_security_type := 'deposit_received';
  end if;

  update public.bookings
  set status = 'secured', financial_security_type = v_security_type, financial_security_status = 'satisfied', secured_at = now(), updated_at = now()
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Booking security transition lost a concurrent update'; end if;

  update public.briefs set status = 'booked' where id = b.brief_id and status in ('buyer_selected','terms_agreed');
  return query select 'secured'::text, v_security_type::text, v_paid::bigint;
end;
$$;

revoke all on function public.ns_accept_buyer_terms_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_accept_buyer_terms_v1(uuid) to service_role;
revoke all on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) to service_role;
revoke all on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) to service_role;
revoke all on function public.ns_secure_booking_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_secure_booking_v1(uuid) to service_role;

comment on column public.bookings.buyer_terms_accepted_deal_id is 'Locked deal snapshot explicitly accepted by the buyer.';
comment on column public.bookings.buyer_terms_acceptance_source is 'Evidence source for buyer acceptance. V1 requires signed_buyer_link.';
comment on column public.payments.evidence_key is 'Normalized provider + provider reference identity used to prevent duplicate payment evidence.';
comment on function public.ns_accept_buyer_terms_v1(uuid) is 'Atomic buyer acceptance bound to a locked deal snapshot, current confirmed talent offer, and signed buyer-link workflow.';
comment on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) is 'Records buyer money as paid only with provider and transaction-reference evidence.';
comment on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) is 'Atomic buyer selection with confirmed availability and mandatory proposal/offer expiry.';
comment on function public.ns_secure_booking_v1(uuid) is 'Final booking gate requiring verified buyer acceptance, current talent offer, safe funding, and evidenced buyer money or authorized security.';
