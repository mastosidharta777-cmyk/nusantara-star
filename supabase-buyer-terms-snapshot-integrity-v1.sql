-- Nusantara Star — Buyer Terms Snapshot Integrity V1
-- Applied to production before this file was committed.
-- Purpose: the exact buyer-facing terms reviewed through the signed buyer link
-- must be the exact snapshot recorded at acceptance and used by booking security.

begin;

alter table public.bookings
  add column if not exists buyer_terms_snapshot jsonb null,
  add column if not exists buyer_terms_accepted_snapshot jsonb null;

alter table public.bookings drop constraint if exists bookings_buyer_terms_snapshot_object;
alter table public.bookings add constraint bookings_buyer_terms_snapshot_object
  check (buyer_terms_snapshot is null or jsonb_typeof(buyer_terms_snapshot) = 'object');

alter table public.bookings drop constraint if exists bookings_buyer_terms_accepted_snapshot_object;
alter table public.bookings add constraint bookings_buyer_terms_accepted_snapshot_object
  check (buyer_terms_accepted_snapshot is null or jsonb_typeof(buyer_terms_accepted_snapshot) = 'object');

alter table public.bookings drop constraint if exists bookings_buyer_terms_acceptance_evidence;
alter table public.bookings add constraint bookings_buyer_terms_acceptance_evidence
  check (
    (
      buyer_terms_accepted_at is null
      and buyer_terms_accepted_deal_id is null
      and buyer_terms_acceptance_source is null
      and buyer_terms_accepted_snapshot is null
    )
    or
    (
      buyer_terms_accepted_at is not null
      and buyer_terms_accepted_deal_id is not null
      and buyer_terms_accepted_deal_id = deal_id
      and buyer_terms_acceptance_source = 'signed_buyer_link'
      and buyer_terms_snapshot is not null
      and buyer_terms_accepted_snapshot = buyer_terms_snapshot
    )
  );

create or replace function public.ns_protect_buyer_terms_snapshot_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.buyer_terms_accepted_at is not null then
    if new.buyer_terms_snapshot is distinct from old.buyer_terms_snapshot
       or new.buyer_terms_accepted_snapshot is distinct from old.buyer_terms_accepted_snapshot
       or new.buyer_terms_accepted_at is distinct from old.buyer_terms_accepted_at
       or new.buyer_terms_accepted_deal_id is distinct from old.buyer_terms_accepted_deal_id
       or new.buyer_terms_acceptance_source is distinct from old.buyer_terms_acceptance_source then
      raise exception 'Accepted buyer terms snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_buyer_terms_snapshot_v1 on public.bookings;
create trigger trg_protect_buyer_terms_snapshot_v1
before update on public.bookings
for each row execute function public.ns_protect_buyer_terms_snapshot_v1();

create or replace function public.ns_accept_buyer_terms_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  br public.briefs%rowtype;
  o public.talent_offers%rowtype;
  v_now timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;

  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' then raise exception 'Deal is not locked'; end if;
  if d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then raise exception 'Booking and locked deal chain do not match'; end if;
  if b.buyer_price is distinct from d.buyer_price
     or b.talent_payable is distinct from d.talent_payable
     or b.direct_cost is distinct from coalesce(d.direct_costs, 0) then
    raise exception 'Booking commercial snapshot does not match the locked deal';
  end if;
  if d.talent_terms_status <> 'confirmed' then raise exception 'Talent terms are unresolved'; end if;
  if d.funding_gap_status <> 'safe' then raise exception 'Funding gap is unresolved'; end if;
  if cardinality(coalesce(d.unresolved_issues, '{}'::text[])) > 0 and d.exception_status <> 'approved' then
    raise exception 'Deal still has unresolved issues without an approved exception';
  end if;

  select * into br from public.briefs where id = b.brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if b.event_date is distinct from br.event_date then raise exception 'Booking event date does not match the brief'; end if;

  if b.buyer_terms_snapshot is null or jsonb_typeof(b.buyer_terms_snapshot) <> 'object' then
    raise exception 'Buyer terms snapshot is missing';
  end if;
  if b.buyer_terms_snapshot ->> 'schema_version' <> '1' then raise exception 'Unsupported buyer terms snapshot version'; end if;
  if b.buyer_terms_snapshot ->> 'deal_id' <> d.id::text then raise exception 'Buyer terms snapshot deal does not match'; end if;
  if b.buyer_terms_snapshot ->> 'brief_id' <> b.brief_id::text then raise exception 'Buyer terms snapshot brief does not match'; end if;
  if b.buyer_terms_snapshot #>> '{event,talent_id}' <> b.talent_id::text then raise exception 'Buyer terms snapshot talent does not match'; end if;
  if b.buyer_terms_snapshot #>> '{event,event_date}' <> b.event_date::text then raise exception 'Buyer terms snapshot event date does not match'; end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,buyer_price}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,buyer_price}')::bigint is distinct from d.buyer_price then
    raise exception 'Buyer terms snapshot price does not match locked deal';
  end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,direct_costs}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,direct_costs}')::bigint is distinct from coalesce(d.direct_costs, 0) then
    raise exception 'Buyer terms snapshot direct costs do not match locked deal';
  end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,taxes_and_payment_fees}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,taxes_and_payment_fees}')::bigint is distinct from coalesce(d.taxes_and_payment_fees, 0) then
    raise exception 'Buyer terms snapshot taxes/payment fees do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #> '{payment_schedule}' is distinct from d.buyer_payment_schedule then
    raise exception 'Buyer terms snapshot payment schedule does not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,cancellation_terms}' is distinct from d.cancellation_terms then
    raise exception 'Buyer terms snapshot cancellation terms do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,rider_notes}' is distinct from d.rider_notes then
    raise exception 'Buyer terms snapshot rider terms do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,special_conditions}' is distinct from d.special_conditions then
    raise exception 'Buyer terms snapshot special conditions do not match locked deal';
  end if;

  if b.buyer_terms_accepted_at is not null
     and b.buyer_terms_accepted_deal_id = d.id
     and b.buyer_terms_acceptance_source = 'signed_buyer_link'
     and b.buyer_terms_accepted_snapshot = b.buyer_terms_snapshot
     and d.buyer_terms_status = 'accepted' then
    return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', b.buyer_terms_accepted_at, 'alreadyAccepted', true);
  end if;

  if b.status <> 'pending_security' then raise exception 'Booking is no longer awaiting buyer terms'; end if;
  if br.status <> 'buyer_selected' then raise exception 'Brief is not at buyer-selected stage'; end if;
  if d.buyer_terms_status <> 'recommended' then raise exception 'Buyer terms are not in an approvable state'; end if;
  if jsonb_typeof(d.buyer_payment_schedule) <> 'array' or jsonb_array_length(d.buyer_payment_schedule) = 0 then raise exception 'Buyer payment schedule is missing'; end if;
  if coalesce(trim(d.cancellation_terms), '') = '' then raise exception 'Buyer cancellation terms are missing'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
    raise exception 'Talent offer requires reconfirmation';
  end if;
  if o.quote_valid_until is null or o.quote_valid_until <= v_now then raise exception 'Talent offer has expired or has no validity'; end if;

  update public.bookings
  set buyer_terms_accepted_at = v_now,
      buyer_terms_accepted_deal_id = d.id,
      buyer_terms_acceptance_source = 'signed_buyer_link',
      buyer_terms_accepted_snapshot = buyer_terms_snapshot,
      updated_at = v_now
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Buyer terms acceptance lost a concurrent update'; end if;

  update public.deals
  set buyer_terms_status = 'accepted', updated_at = v_now
  where id = d.id and status = 'locked' and buyer_terms_status = 'recommended';
  if not found then raise exception 'Deal changed before buyer acceptance'; end if;

  update public.briefs
  set status = 'terms_agreed', updated_at = v_now
  where id = b.brief_id and status = 'buyer_selected';
  if not found then raise exception 'Brief changed before buyer acceptance was finalized'; end if;

  return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', v_now, 'alreadyAccepted', false, 'source', 'signed_buyer_link', 'snapshotVersion', 1);
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
  br public.briefs%rowtype;
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
  if d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then raise exception 'Booking and locked deal chain do not match'; end if;
  if b.buyer_price is distinct from d.buyer_price
     or b.talent_payable is distinct from d.talent_payable
     or b.direct_cost is distinct from coalesce(d.direct_costs, 0) then
    raise exception 'Booking commercial snapshot does not match the locked deal';
  end if;
  if d.talent_terms_status <> 'confirmed' then raise exception 'Talent terms are unresolved'; end if;
  if b.buyer_terms_accepted_at is null
     or d.buyer_terms_status <> 'accepted'
     or b.buyer_terms_accepted_deal_id <> b.deal_id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or b.buyer_terms_snapshot is null
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Buyer terms are not verified as accepted';
  end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,taxes_and_payment_fees}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,taxes_and_payment_fees}')::bigint is distinct from coalesce(d.taxes_and_payment_fees, 0)
     or b.buyer_terms_snapshot #> '{payment_schedule}' is distinct from d.buyer_payment_schedule
     or b.buyer_terms_snapshot #>> '{terms,cancellation_terms}' is distinct from d.cancellation_terms
     or b.buyer_terms_snapshot #>> '{terms,rider_notes}' is distinct from d.rider_notes
     or b.buyer_terms_snapshot #>> '{terms,special_conditions}' is distinct from d.special_conditions then
    raise exception 'Locked deal changed after buyer acceptance';
  end if;
  if d.funding_gap_status <> 'safe' then raise exception 'Funding gap is unresolved'; end if;
  if cardinality(coalesce(d.unresolved_issues, '{}'::text[])) > 0 and d.exception_status <> 'approved' then
    raise exception 'Deal still has unresolved issues without an approved exception';
  end if;

  select * into br from public.briefs where id = b.brief_id for update;
  if not found or br.status <> 'terms_agreed' then raise exception 'Buyer terms stage is not finalized on the brief'; end if;
  if b.event_date is distinct from br.event_date then raise exception 'Booking event date does not match the brief'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then raise exception 'Talent offer requires reconfirmation'; end if;
  if o.quote_valid_until is null or o.quote_valid_until <= now() then raise exception 'Talent offer has expired or has no validity'; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where booking_id = b.id
    and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
    and status = 'paid'
    and coalesce(trim(provider), '') <> ''
    and coalesce(trim(provider_reference), '') <> ''
    and coalesce(trim(evidence_key), '') <> '';

  if b.financial_security_status = 'satisfied' and b.financial_security_type in ('approved_po_credit','authorized_exception') then
    if coalesce(trim(b.financial_security_reference), '') = '' then raise exception 'Manual financial security reference is required'; end if;
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

  update public.briefs set status = 'booked', updated_at = now() where id = b.brief_id and status = 'terms_agreed';
  if not found then raise exception 'Brief changed before booking security was finalized'; end if;

  return query select 'secured'::text, v_security_type::text, v_paid::bigint;
end;
$$;

revoke all on function public.ns_accept_buyer_terms_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_accept_buyer_terms_v1(uuid) to service_role;
revoke all on function public.ns_secure_booking_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_secure_booking_v1(uuid) to service_role;
revoke all on function public.ns_protect_buyer_terms_snapshot_v1() from public, anon, authenticated;
grant execute on function public.ns_protect_buyer_terms_snapshot_v1() to service_role;

comment on column public.bookings.buyer_terms_snapshot is
  'Immutable buyer-facing commercial terms snapshot created from the locked deal before buyer acceptance.';
comment on column public.bookings.buyer_terms_accepted_snapshot is
  'Exact buyer terms snapshot accepted through the signed buyer link; must equal buyer_terms_snapshot.';
comment on function public.ns_accept_buyer_terms_v1(uuid) is
  'Atomic buyer acceptance bound to an immutable buyer-facing terms snapshot, locked deal, current talent offer, and signed buyer-link workflow.';
comment on function public.ns_secure_booking_v1(uuid) is
  'Final booking gate requiring exact buyer terms snapshot acceptance, current locked deal, current talent offer, safe funding, and evidenced buyer security.';

commit;
