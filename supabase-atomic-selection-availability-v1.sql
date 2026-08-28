-- Nusantara Star — Atomic Buyer Selection + Availability Response V1
-- Run after supabase-buyer-selection-v1.sql, supabase-talent-offer-v1.sql, and supabase-smart-proposal-v1.sql.
-- Moves the two multi-write public signed-link workflows into database transactions.

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
  if v_brief.status not in ('proposal_sent','buyer_selected') then
    raise exception 'Brief is not ready for buyer selection';
  end if;

  select * into v_item
  from public.proposal_items
  where id = p_proposal_item_id and brief_id = p_brief_id and talent_id = p_talent_id;
  if not found then raise exception 'Talent is not part of this proposal snapshot'; end if;

  select * into v_proposal
  from public.proposals
  where id = v_item.proposal_id
  for update;
  if not found or v_proposal.brief_id <> p_brief_id or v_proposal.status not in ('sent','viewed','selected') then
    raise exception 'Proposal is not selectable';
  end if;
  if v_proposal.expires_at is not null and v_proposal.expires_at <= v_now then
    raise exception 'Proposal has expired and requires reconfirmation';
  end if;
  if v_item.offer_valid_until is not null and v_item.offer_valid_until <= v_now then
    raise exception 'Talent offer has expired and requires reconfirmation';
  end if;

  select * into v_existing
  from public.buyer_selections
  where brief_id = p_brief_id
  for update;

  if found then
    if v_existing.talent_id <> p_talent_id then
      raise exception 'A talent selection is already recorded';
    end if;
    if v_existing.status <> 'selected' then
      update public.buyer_selections
      set status = 'selected', selected_at = v_now, updated_at = v_now
      where id = v_existing.id;
    end if;
    if v_brief.status = 'proposal_sent' then
      update public.briefs set status = 'buyer_selected', updated_at = v_now where id = p_brief_id;
    end if;
    if v_proposal.status <> 'selected' then
      update public.proposals set status = 'selected', updated_at = v_now where id = v_proposal.id;
    end if;
    return jsonb_build_object('briefId', p_brief_id, 'talentId', p_talent_id, 'proposalId', v_proposal.id, 'proposalItemId', p_proposal_item_id, 'status', 'buyer_selected', 'alreadySelected', true);
  end if;

  insert into public.buyer_selections (brief_id, talent_id, status, selected_at, updated_at)
  values (p_brief_id, p_talent_id, 'selected', v_now, v_now);

  update public.briefs set status = 'buyer_selected', updated_at = v_now where id = p_brief_id;
  update public.proposals set status = 'selected', updated_at = v_now where id = v_proposal.id;

  return jsonb_build_object('briefId', p_brief_id, 'talentId', p_talent_id, 'proposalId', v_proposal.id, 'proposalItemId', p_proposal_item_id, 'status', 'buyer_selected', 'alreadySelected', false);
end;
$$;

create or replace function public.ns_record_availability_response_v1(
  p_request_id uuid,
  p_status text,
  p_event_fee bigint default null,
  p_included_costs text default null,
  p_excluded_costs text default null,
  p_payment_terms text default null,
  p_rider_exceptions text default null,
  p_quote_valid_until timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.availability_requests%rowtype;
  v_brief public.briefs%rowtype;
  v_match public.match_results%rowtype;
  v_offer_status text;
  v_calendar_status text;
  v_next_brief_status text;
  v_now timestamptz := now();
begin
  if p_status not in ('confirmed','tentative','unavailable','no_response') then raise exception 'Invalid response status'; end if;
  if p_event_fee is not null and p_event_fee < 0 then raise exception 'Invalid event fee'; end if;
  if p_status = 'confirmed' and coalesce(p_event_fee,0) <= 0 then raise exception 'Confirmed offer requires an event fee'; end if;
  if p_quote_valid_until is not null and p_quote_valid_until <= v_now then raise exception 'Quote validity must be in the future'; end if;

  select * into v_request from public.availability_requests where id = p_request_id for update;
  if not found then raise exception 'Availability request not found'; end if;

  select * into v_brief from public.briefs where id = v_request.brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if v_brief.status not in ('availability_check','shortlisted') then
    raise exception 'This offer can no longer be changed from the talent link';
  end if;

  if v_brief.event_date is not null and p_status <> 'no_response' then
    v_calendar_status := case when p_status = 'confirmed' then 'available' else p_status end;
    insert into public.talent_availability (talent_id,event_date,status,notes,updated_at)
    values (v_request.talent_id,v_brief.event_date,v_calendar_status,'Live confirmation response for brief ' || v_request.brief_id::text,v_now)
    on conflict (talent_id,event_date) do update
      set status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at;
    update public.talents set last_calendar_updated_at = v_now, updated_at = v_now where id = v_request.talent_id;
  end if;

  update public.availability_requests set status = p_status, responded_at = v_now, updated_at = v_now where id = p_request_id;

  if p_status = 'no_response' then
    update public.talent_offers
      set status = 'expired', updated_at = v_now
      where availability_request_id = p_request_id and status <> 'expired';
  else
    -- Offer lifecycle follows the manager's current response, not whether this is the first response.
    -- This allows tentative -> confirmed to become proposal-eligible once the manager explicitly confirms.
    v_offer_status := case
      when p_status = 'confirmed' then 'confirmed'
      when p_status = 'unavailable' then 'unavailable'
      else 'changed'
    end;
    insert into public.talent_offers (
      availability_request_id,brief_id,talent_id,status,availability_status,event_fee,currency,
      included_costs,excluded_costs,payment_terms,rider_exceptions,quote_valid_until,
      confirmation_source,confirmed_at,updated_at
    ) values (
      p_request_id,v_request.brief_id,v_request.talent_id,v_offer_status,p_status,
      case when p_status='unavailable' then null else p_event_fee end,'IDR',
      p_included_costs,p_excluded_costs,p_payment_terms,p_rider_exceptions,
      case when p_status='unavailable' then null else p_quote_valid_until end,
      'manager_portal',v_now,v_now
    ) on conflict (availability_request_id) do update set
      status = excluded.status,
      availability_status = excluded.availability_status,
      event_fee = excluded.event_fee,
      currency = excluded.currency,
      included_costs = excluded.included_costs,
      excluded_costs = excluded.excluded_costs,
      payment_terms = excluded.payment_terms,
      rider_exceptions = excluded.rider_exceptions,
      quote_valid_until = excluded.quote_valid_until,
      confirmation_source = excluded.confirmation_source,
      confirmed_at = excluded.confirmed_at,
      updated_at = excluded.updated_at;
  end if;

  v_next_brief_status := v_brief.status;
  if p_status = 'confirmed' and v_brief.status = 'availability_check' then
    select * into v_match from public.match_results
    where brief_id = v_request.brief_id and talent_id = v_request.talent_id;
    if found and v_match.admin_approved = true and v_match.admin_rejected <> true then
      v_next_brief_status := 'shortlisted';
      update public.briefs set status = 'shortlisted', updated_at = v_now where id = v_request.brief_id;
    end if;
  end if;

  return jsonb_build_object(
    'requestId', p_request_id,
    'briefId', v_request.brief_id,
    'talentId', v_request.talent_id,
    'status', p_status,
    'talentOffer', p_status <> 'no_response',
    'briefStatus', v_next_brief_status
  );
end;
$$;

revoke all on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) to service_role;
revoke all on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) to service_role;

comment on function public.ns_select_buyer_talent_v1(uuid,uuid,uuid) is 'Atomic buyer talent selection: validates proposal snapshot/expiry, prevents conflicting selection, and updates selection + brief + proposal in one transaction.';
comment on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) is 'Atomic talent availability/offer response: calendar freshness + request + event offer + brief status transition in one transaction.';
