-- Nusantara Star — Guarded Buyer Fallback Promotion V1
-- Admin-triggered only. A fallback may be promoted only before Deal Review/booking exists
-- and only after the current active buyer priority is no longer eligible from live system data.

create table if not exists public.buyer_priority_promotions (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  preference_set_id uuid not null,
  from_preference_id uuid not null references public.buyer_preferences(id) on delete restrict,
  to_preference_id uuid not null references public.buyer_preferences(id) on delete restrict,
  from_talent_id uuid not null references public.talents(id) on delete restrict,
  to_talent_id uuid not null references public.talents(id) on delete restrict,
  from_priority_rank smallint not null check (from_priority_rank between 1 and 3),
  to_priority_rank smallint not null check (to_priority_rank between 1 and 3),
  reason text not null,
  promoted_at timestamptz not null default now()
);

create index if not exists idx_buyer_priority_promotions_brief
  on public.buyer_priority_promotions(brief_id, promoted_at desc);

alter table public.buyer_priority_promotions enable row level security;

create or replace function public.ns_buyer_preference_eligible_v1(
  p_brief_id uuid,
  p_preference_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.buyer_preferences bp
    join public.briefs b
      on b.id = bp.brief_id
    join public.proposals p
      on p.id = bp.proposal_id
     and p.brief_id = bp.brief_id
    join public.proposal_items pi
      on pi.id = bp.proposal_item_id
     and pi.proposal_id = bp.proposal_id
     and pi.brief_id = bp.brief_id
     and pi.talent_id = bp.talent_id
    join public.talent_offers o
      on o.id = pi.talent_offer_id
     and o.brief_id = bp.brief_id
     and o.talent_id = bp.talent_id
    where bp.id = p_preference_id
      and bp.brief_id = p_brief_id
      and bp.is_current
      and p.status in ('sent','viewed','selected')
      and p.expires_at is not null
      and p.expires_at > now()
      and pi.availability_status = 'confirmed'
      and pi.offer_valid_until is not null
      and pi.offer_valid_until > now()
      and o.status = 'confirmed'
      and o.availability_status = 'confirmed'
      and o.quote_valid_until is not null
      and o.quote_valid_until > now()
      and not exists (
        select 1
        from public.talent_availability ta
        where ta.talent_id = bp.talent_id
          and ta.event_date = b.event_date
          and ta.status <> 'available'
      )
      and not exists (
        select 1
        from public.bookings bk
        join public.briefs other_brief on other_brief.id = bk.brief_id
        where bk.talent_id = bp.talent_id
          and bk.brief_id <> p_brief_id
          and other_brief.event_date = b.event_date
          and bk.status in ('pending_security','secured','pre_show','incident')
      )
      and not exists (
        select 1
        from public.recovery_cases rc
        where rc.recovery_brief_id = p_brief_id
          and rc.status <> 'void'
          and rc.original_talent_id = bp.talent_id
      )
  );
$$;

create or replace function public.ns_promote_buyer_fallback_v1(
  p_brief_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
  v_active public.buyer_preferences%rowtype;
  v_candidate public.buyer_preferences%rowtype;
  v_selection public.buyer_selections%rowtype;
  v_candidate_item public.proposal_items%rowtype;
  v_candidate_offer public.talent_offers%rowtype;
  v_now timestamptz := now();
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_reason = '' then
    raise exception 'Fallback promotion reason is required';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'Fallback promotion reason is too long';
  end if;

  select * into v_brief
  from public.briefs
  where id = p_brief_id
  for update;
  if not found then raise exception 'Brief not found'; end if;
  if v_brief.status <> 'buyer_selected' then
    raise exception 'Fallback promotion is only allowed while the brief is at buyer selection stage';
  end if;

  if exists (select 1 from public.deals where brief_id = p_brief_id) then
    raise exception 'Fallback promotion is blocked after Deal Review has started';
  end if;
  if exists (select 1 from public.bookings where brief_id = p_brief_id) then
    raise exception 'Fallback promotion is blocked after booking creation';
  end if;

  perform 1
  from public.buyer_preferences
  where brief_id = p_brief_id and is_current
  for update;

  select * into v_active
  from public.buyer_preferences
  where brief_id = p_brief_id
    and is_current
    and status = 'active_priority'
  limit 1;
  if not found then raise exception 'Active buyer priority not found'; end if;

  select * into v_selection
  from public.buyer_selections
  where brief_id = p_brief_id
  for update;
  if not found or v_selection.status <> 'selected' or v_selection.talent_id <> v_active.talent_id then
    raise exception 'Buyer selection mirror is inconsistent with the active priority';
  end if;

  if public.ns_buyer_preference_eligible_v1(p_brief_id, v_active.id) then
    raise exception 'Active buyer priority is still eligible. Buyer must change the priority order instead.';
  end if;

  select bp.* into v_candidate
  from public.buyer_preferences bp
  where bp.brief_id = p_brief_id
    and bp.preference_set_id = v_active.preference_set_id
    and bp.is_current
    and bp.status = 'fallback'
    and bp.priority_rank > v_active.priority_rank
    and public.ns_buyer_preference_eligible_v1(p_brief_id, bp.id)
  order by bp.priority_rank asc
  limit 1;

  if not found then
    raise exception 'No eligible buyer fallback remains. Reconfirm availability or send a revised proposal.';
  end if;

  -- Lock the live candidate offer before changing the active selection, then re-check.
  select * into v_candidate_item
  from public.proposal_items
  where id = v_candidate.proposal_item_id
    and brief_id = p_brief_id
    and talent_id = v_candidate.talent_id
  for update;
  if not found then raise exception 'Fallback proposal item not found'; end if;

  select * into v_candidate_offer
  from public.talent_offers
  where id = v_candidate_item.talent_offer_id
  for update;
  if not found then raise exception 'Fallback live offer not found'; end if;

  if not public.ns_buyer_preference_eligible_v1(p_brief_id, v_candidate.id) then
    raise exception 'Fallback eligibility changed during promotion. Refresh and try again.';
  end if;

  update public.buyer_preferences
  set status = 'withdrawn',
      status_reason = 'Active choice became ineligible. Admin reason: ' || v_reason,
      updated_at = v_now
  where id = v_active.id;

  update public.buyer_preferences
  set status = 'withdrawn',
      status_reason = 'Skipped during guarded fallback promotion because live eligibility check failed',
      updated_at = v_now
  where brief_id = p_brief_id
    and preference_set_id = v_active.preference_set_id
    and is_current
    and status = 'fallback'
    and priority_rank > v_active.priority_rank
    and priority_rank < v_candidate.priority_rank;

  update public.buyer_preferences
  set status = 'active_priority',
      status_reason = 'Promoted after the prior buyer choice became ineligible. Admin reason: ' || v_reason,
      updated_at = v_now
  where id = v_candidate.id;

  update public.buyer_selections
  set talent_id = v_candidate.talent_id,
      status = 'selected',
      selected_at = v_now,
      updated_at = v_now
  where id = v_selection.id;

  insert into public.buyer_priority_promotions (
    brief_id, preference_set_id,
    from_preference_id, to_preference_id,
    from_talent_id, to_talent_id,
    from_priority_rank, to_priority_rank,
    reason, promoted_at
  ) values (
    p_brief_id, v_active.preference_set_id,
    v_active.id, v_candidate.id,
    v_active.talent_id, v_candidate.talent_id,
    v_active.priority_rank, v_candidate.priority_rank,
    v_reason, v_now
  );

  return jsonb_build_object(
    'briefId', p_brief_id,
    'fromTalentId', v_active.talent_id,
    'toTalentId', v_candidate.talent_id,
    'fromPriorityRank', v_active.priority_rank,
    'toPriorityRank', v_candidate.priority_rank,
    'status', 'buyer_selected'
  );
end;
$$;

revoke all on table public.buyer_priority_promotions from anon, authenticated;
revoke all on function public.ns_buyer_preference_eligible_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.ns_promote_buyer_fallback_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.ns_promote_buyer_fallback_v1(uuid,text) to service_role;

comment on table public.buyer_priority_promotions is 'Immutable audit events for guarded admin promotion from an ineligible active buyer choice to the next eligible ordered fallback.';
comment on function public.ns_promote_buyer_fallback_v1(uuid,text) is 'Promotes the next eligible ordered buyer fallback only before Deal Review/booking and only when the active buyer choice is no longer eligible from live data.';
