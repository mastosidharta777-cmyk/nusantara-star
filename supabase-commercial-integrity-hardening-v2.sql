-- Nusantara Star — Commercial Integrity Hardening V2
-- Locks the Golden Flow from locked Deal -> verified Buyer Terms -> Financial Security -> Secured Booking.

alter table public.bookings alter column status set default 'pending_security';

alter table public.bookings
  drop constraint if exists bookings_post_security_evidence;
alter table public.bookings
  add constraint bookings_post_security_evidence check (
    status not in ('secured','pre_show','incident','completed')
    or (
      deal_id is not null
      and buyer_terms_accepted_at is not null
      and buyer_terms_accepted_deal_id = deal_id
      and buyer_terms_acceptance_source = 'signed_buyer_link'
      and financial_security_status = 'satisfied'
      and financial_security_type is not null
      and secured_at is not null
    )
  ) not valid;

alter table public.bookings
  drop constraint if exists bookings_manual_security_requires_reference;
alter table public.bookings
  add constraint bookings_manual_security_requires_reference check (
    financial_security_status <> 'satisfied'
    or financial_security_type not in ('approved_po_credit','authorized_exception')
    or coalesce(trim(financial_security_reference), '') <> ''
  ) not valid;

alter table public.bookings validate constraint bookings_buyer_terms_acceptance_evidence;
alter table public.bookings validate constraint bookings_post_security_evidence;
alter table public.bookings validate constraint bookings_manual_security_requires_reference;
alter table public.payments validate constraint payments_paid_requires_evidence;

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

  if b.buyer_terms_accepted_at is not null
     and b.buyer_terms_accepted_deal_id = d.id
     and b.buyer_terms_acceptance_source = 'signed_buyer_link'
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

  return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', v_now, 'alreadyAccepted', false, 'source', 'signed_buyer_link');
end;
$$;

create or replace function public.ns_record_buyer_payment_v1(
  p_booking_id uuid,
  p_payment_id uuid,
  p_provider text,
  p_provider_reference text,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
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
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;

  select * into d from public.deals where id = b.deal_id;
  if not found or d.status <> 'locked' or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then raise exception 'Booking and locked deal chain do not match'; end if;
  if b.buyer_terms_accepted_at is null
     or b.buyer_terms_accepted_deal_id <> b.deal_id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or d.buyer_terms_status <> 'accepted' then
    raise exception 'Buyer terms must be accepted before buyer payment is recorded';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> p_booking_id then raise exception 'Payment does not belong to booking'; end if;
  if p.payment_type not in ('buyer_deposit','buyer_balance','buyer_full_payment') then raise exception 'Payment is not an eligible buyer payment'; end if;

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
  if b.buyer_terms_accepted_at is null or d.buyer_terms_status <> 'accepted' or b.buyer_terms_accepted_deal_id <> b.deal_id or b.buyer_terms_acceptance_source <> 'signed_buyer_link' then raise exception 'Buyer terms are not verified as accepted'; end if;
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

create or replace function public.ns_guard_booking_integrity_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  d public.deals%rowtype;
  br public.briefs%rowtype;
  o public.talent_offers%rowtype;
  m public.payment_milestones%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_entering_secured boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.brief_id is distinct from new.brief_id
       or old.deal_id is distinct from new.deal_id
       or old.talent_id is distinct from new.talent_id
       or old.event_date is distinct from new.event_date
       or old.buyer_price is distinct from new.buyer_price
       or old.talent_payable is distinct from new.talent_payable
       or old.direct_cost is distinct from new.direct_cost then
      raise exception 'Booking deal identity and commercial snapshot are immutable';
    end if;

    if old.buyer_terms_accepted_at is not null and (
      old.buyer_terms_accepted_at is distinct from new.buyer_terms_accepted_at
      or old.buyer_terms_accepted_deal_id is distinct from new.buyer_terms_accepted_deal_id
      or old.buyer_terms_acceptance_source is distinct from new.buyer_terms_acceptance_source
    ) then
      raise exception 'Verified buyer acceptance evidence is immutable';
    end if;

    if old.status in ('secured','pre_show','incident','completed') and (
      old.financial_security_type is distinct from new.financial_security_type
      or old.financial_security_status is distinct from new.financial_security_status
      or old.financial_security_reference is distinct from new.financial_security_reference
      or old.secured_at is distinct from new.secured_at
    ) then
      raise exception 'Secured booking financial evidence is immutable';
    end if;
  end if;

  if new.deal_id is not null then
    select * into d from public.deals where id = new.deal_id;
    if not found then raise exception 'Booking deal not found'; end if;
    if d.brief_id <> new.brief_id or d.talent_id <> new.talent_id then raise exception 'Booking and deal chain do not match'; end if;
    if new.buyer_price is distinct from d.buyer_price
       or new.talent_payable is distinct from d.talent_payable
       or new.direct_cost is distinct from coalesce(d.direct_costs, 0) then
      raise exception 'Booking commercial snapshot does not match the deal';
    end if;

    select * into br from public.briefs where id = new.brief_id;
    if not found or new.event_date is distinct from br.event_date then raise exception 'Booking event date does not match the brief'; end if;
  end if;

  if new.status in ('secured','pre_show','incident','completed') then
    if new.deal_id is null then raise exception 'Secured booking lifecycle requires a deal'; end if;
    if d.status <> 'locked' then raise exception 'Secured booking lifecycle requires a locked deal'; end if;
    if new.buyer_terms_accepted_at is null
       or new.buyer_terms_accepted_deal_id <> new.deal_id
       or new.buyer_terms_acceptance_source <> 'signed_buyer_link'
       or d.buyer_terms_status <> 'accepted' then
      raise exception 'Secured booking lifecycle requires verified buyer terms';
    end if;
    if d.talent_terms_status <> 'confirmed' then raise exception 'Secured booking lifecycle requires confirmed talent terms'; end if;
    if d.funding_gap_status <> 'safe' then raise exception 'Secured booking lifecycle requires a safe funding state'; end if;
    if cardinality(coalesce(d.unresolved_issues, '{}'::text[])) > 0 and d.exception_status <> 'approved' then
      raise exception 'Secured booking lifecycle has unresolved deal issues without an approved exception';
    end if;
    if new.financial_security_status <> 'satisfied' or new.financial_security_type is null or new.secured_at is null then
      raise exception 'Secured booking lifecycle requires financial security evidence';
    end if;
  end if;

  if tg_op = 'INSERT' and new.status in ('pre_show','incident','completed') then
    raise exception 'Booking must enter secured state before later lifecycle states';
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending_security' and new.status in ('pre_show','incident','completed') then
    raise exception 'Booking must enter secured state before later lifecycle states';
  end if;

  v_entering_secured := new.status = 'secured' and (tg_op = 'INSERT' or old.status <> 'secured');
  if v_entering_secured then
    if br.status <> 'terms_agreed' then raise exception 'Brief must be terms_agreed before booking is secured'; end if;

    select * into o from public.talent_offers where id = d.talent_offer_id;
    if not found or o.brief_id <> new.brief_id or o.talent_id <> new.talent_id or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
      raise exception 'Talent offer requires reconfirmation before booking is secured';
    end if;
    if o.quote_valid_until is null or o.quote_valid_until <= now() then raise exception 'Talent offer is expired before booking is secured'; end if;

    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where booking_id = new.id
      and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
      and status = 'paid'
      and coalesce(trim(provider), '') <> ''
      and coalesce(trim(provider_reference), '') <> ''
      and coalesce(trim(evidence_key), '') <> '';

    if new.financial_security_type in ('approved_po_credit','authorized_exception') then
      if coalesce(trim(new.financial_security_reference), '') = '' then raise exception 'Manual financial security reference is required'; end if;
      if new.financial_security_type = 'authorized_exception' and d.exception_status <> 'approved' then raise exception 'Commercial exception is not approved'; end if;
    elsif new.financial_security_type = 'full_payment_received' then
      if new.buyer_price is null or new.buyer_price <= 0 or v_paid < new.buyer_price then raise exception 'Verified full buyer payment is insufficient'; end if;
    elsif new.financial_security_type = 'deposit_received' then
      select * into m from public.payment_milestones where booking_id = new.id and party = 'buyer' order by sequence_no asc limit 1;
      if not found then raise exception 'Buyer payment milestones are missing'; end if;
      if m.calculation_type = 'percentage' then v_required := round(new.buyer_price * (coalesce(m.percentage, 0) / 100.0));
      elsif m.calculation_type = 'fixed_amount' then v_required := coalesce(m.amount, 0);
      else v_required := new.buyer_price;
      end if;
      if v_required <= 0 or v_paid < v_required then raise exception 'Verified buyer payment is insufficient for booking security'; end if;
    else
      raise exception 'Unsupported financial security type for secured booking';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_integrity on public.bookings;
create trigger trg_booking_integrity
before insert or update on public.bookings
for each row execute function public.ns_guard_booking_integrity_v1();

create or replace function public.ns_guard_payment_milestone_snapshot_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  v_expected jsonb;
  v_actual jsonb;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found or b.deal_id is null then return new; end if;

  if tg_op = 'UPDATE' then
    if old.booking_id is distinct from new.booking_id
       or old.party is distinct from new.party
       or old.milestone_type is distinct from new.milestone_type
       or old.sequence_no is distinct from new.sequence_no
       or old.calculation_type is distinct from new.calculation_type
       or old.percentage is distinct from new.percentage
       or old.amount is distinct from new.amount
       or old.due_basis is distinct from new.due_basis
       or old.due_offset_days is distinct from new.due_offset_days
       or old.custom_due_date is distinct from new.custom_due_date
       or old.refundable is distinct from new.refundable
       or old.cancellation_note is distinct from new.cancellation_note
       or old.notes is distinct from new.notes then
      raise exception 'Locked-deal payment milestone contract fields are immutable';
    end if;
    return new;
  end if;

  select * into d from public.deals where id = b.deal_id;
  if not found or d.status <> 'locked' then raise exception 'Payment milestone snapshot requires a locked deal'; end if;

  if new.party = 'buyer' then
    v_expected := d.buyer_payment_schedule -> (new.sequence_no - 1);
  else
    v_expected := d.talent_payment_schedule -> (new.sequence_no - 1);
  end if;
  if v_expected is null then raise exception 'Payment milestone is not present in the locked deal schedule'; end if;

  v_actual := jsonb_strip_nulls(jsonb_build_object(
    'milestone_type', new.milestone_type,
    'sequence_no', new.sequence_no,
    'calculation_type', new.calculation_type,
    'percentage', new.percentage,
    'amount', new.amount,
    'due_basis', new.due_basis,
    'due_offset_days', new.due_offset_days,
    'custom_due_date', new.custom_due_date,
    'refundable', new.refundable,
    'cancellation_note', new.cancellation_note,
    'notes', new.notes
  ));

  if jsonb_strip_nulls(v_expected) <> v_actual then
    raise exception 'Payment milestone does not match the locked deal schedule';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_milestone_snapshot on public.payment_milestones;
create trigger trg_payment_milestone_snapshot
before insert or update on public.payment_milestones
for each row execute function public.ns_guard_payment_milestone_snapshot_v1();

revoke all on function public.ns_accept_buyer_terms_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.ns_secure_booking_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_accept_buyer_terms_v1(uuid) to service_role;
grant execute on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.ns_secure_booking_v1(uuid) to service_role;

comment on function public.ns_accept_buyer_terms_v1(uuid) is 'Verified buyer acceptance gate: requires the locked booking/deal chain, safe commercial state, current offer, and buyer-selected brief status.';
comment on function public.ns_secure_booking_v1(uuid) is 'Final booking security gate: requires verified buyer terms, immutable locked-deal chain, eligible buyer payment/manual security evidence, and terms_agreed brief state.';
comment on function public.ns_guard_booking_integrity_v1() is 'Database invariant preventing direct or accidental bypass of booking identity, buyer acceptance, financial security, and secured-state gates.';
comment on function public.ns_guard_payment_milestone_snapshot_v1() is 'Database invariant keeping deal-backed payment milestone contract fields equal to the locked deal snapshot.';
