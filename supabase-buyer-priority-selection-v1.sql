-- Nusantara Star — Buyer Priority Selection V1
-- Additive source-of-truth for ordered buyer preferences.
-- Keeps legacy buyer_selections as the single active talent compatibility row for downstream deal/booking flow.

create table if not exists public.buyer_preferences (
  id uuid primary key default gen_random_uuid(),
  preference_set_id uuid not null,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  proposal_item_id uuid not null references public.proposal_items(id) on delete restrict,
  talent_id uuid not null references public.talents(id) on delete restrict,
  priority_rank smallint not null check (priority_rank between 1 and 5),
  status text not null check (status in ('ranked','active_priority','fallback','withdrawn','superseded','secured')),
  is_current boolean not null default true,
  status_reason text null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_buyer_preferences_brief on public.buyer_preferences(brief_id);
create index if not exists idx_buyer_preferences_proposal on public.buyer_preferences(proposal_id);
create index if not exists idx_buyer_preferences_current on public.buyer_preferences(brief_id, is_current, priority_rank);
create unique index if not exists uq_buyer_preferences_current_rank
  on public.buyer_preferences(brief_id, priority_rank)
  where is_current;
create unique index if not exists uq_buyer_preferences_current_talent
  on public.buyer_preferences(brief_id, talent_id)
  where is_current;
create unique index if not exists uq_buyer_preferences_current_active
  on public.buyer_preferences(brief_id)
  where is_current and status = 'active_priority';

alter table public.buyer_preferences enable row level security;

create or replace function public.ns_set_buyer_priorities_v1(
  p_brief_id uuid,
  p_proposal_id uuid,
  p_priorities jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
  v_proposal public.proposals%rowtype;
  v_item public.proposal_items%rowtype;
  v_offer public.talent_offers%rowtype;
  v_entry record;
  v_count integer;
  v_distinct_rank integer;
  v_distinct_talent integer;
  v_distinct_item integer;
  v_min_rank integer;
  v_max_rank integer;
  v_set_id uuid := gen_random_uuid();
  v_top_talent uuid;
  v_now timestamptz := now();
  v_result jsonb;
begin
  if jsonb_typeof(p_priorities) <> 'array' then
    raise exception 'Buyer priorities must be an array';
  end if;

  v_count := jsonb_array_length(p_priorities);
  if v_count < 1 or v_count > 3 then
    raise exception 'Buyer may rank between 1 and 3 options';
  end if;

  select * into v_brief from public.briefs where id = p_brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if v_brief.status not in ('proposal_sent','buyer_selected') then
    raise exception 'Brief is not ready for buyer priority selection';
  end if;

  select * into v_proposal from public.proposals where id = p_proposal_id and brief_id = p_brief_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_proposal.status not in ('sent','viewed','selected') then
    raise exception 'Proposal is not selectable';
  end if;
  if v_proposal.expires_at is null or v_proposal.expires_at <= v_now then
    raise exception 'Proposal has expired or has no validity';
  end if;

  if exists (select 1 from public.deals where brief_id = p_brief_id) then
    raise exception 'Buyer priorities cannot be changed after deal review has started';
  end if;
  if exists (select 1 from public.bookings where brief_id = p_brief_id) then
    raise exception 'Buyer priorities cannot be changed after booking creation';
  end if;

  select
    count(distinct x.priority_rank),
    count(distinct x.talent_id),
    count(distinct x.proposal_item_id),
    min(x.priority_rank),
    max(x.priority_rank)
  into v_distinct_rank, v_distinct_talent, v_distinct_item, v_min_rank, v_max_rank
  from jsonb_to_recordset(p_priorities) as x(
    proposal_item_id uuid,
    talent_id uuid,
    priority_rank integer
  );

  if v_distinct_rank <> v_count or v_distinct_talent <> v_count or v_distinct_item <> v_count then
    raise exception 'Buyer priority ranks, talents, and proposal items must be unique';
  end if;
  if v_min_rank <> 1 or v_max_rank <> v_count then
    raise exception 'Buyer priority ranks must be contiguous starting from 1';
  end if;

  for v_entry in
    select * from jsonb_to_recordset(p_priorities) as x(
      proposal_item_id uuid,
      talent_id uuid,
      priority_rank integer
    )
    order by priority_rank
  loop
    select * into v_item
    from public.proposal_items
    where id = v_entry.proposal_item_id
      and proposal_id = p_proposal_id
      and brief_id = p_brief_id
      and talent_id = v_entry.talent_id;
    if not found then raise exception 'A ranked talent is not part of this proposal snapshot'; end if;
    if v_item.availability_status <> 'confirmed' then raise exception 'A ranked talent availability is not confirmed'; end if;
    if v_item.offer_valid_until is null or v_item.offer_valid_until <= v_now then raise exception 'A ranked talent offer has expired or has no validity'; end if;

    select * into v_offer from public.talent_offers where id = v_item.talent_offer_id;
    if not found then raise exception 'Talent offer not found for ranked option'; end if;
    if v_offer.status <> 'confirmed' or v_offer.availability_status <> 'confirmed' then
      raise exception 'A ranked talent no longer has a confirmed live offer';
    end if;
    if v_offer.quote_valid_until is null or v_offer.quote_valid_until <= v_now then
      raise exception 'A ranked talent live offer has expired';
    end if;

    if v_entry.priority_rank = 1 then v_top_talent := v_entry.talent_id; end if;
  end loop;

  update public.buyer_preferences
  set is_current = false,
      status = 'superseded',
      status_reason = 'Buyer submitted a newer priority order',
      updated_at = v_now
  where brief_id = p_brief_id and is_current;

  insert into public.buyer_preferences (
    preference_set_id, brief_id, proposal_id, proposal_item_id, talent_id,
    priority_rank, status, is_current, submitted_at, updated_at
  )
  select
    v_set_id,
    p_brief_id,
    p_proposal_id,
    x.proposal_item_id,
    x.talent_id,
    x.priority_rank,
    case when x.priority_rank = 1 then 'active_priority' else 'fallback' end,
    true,
    v_now,
    v_now
  from jsonb_to_recordset(p_priorities) as x(
    proposal_item_id uuid,
    talent_id uuid,
    priority_rank integer
  )
  order by x.priority_rank;

  insert into public.buyer_selections (brief_id, talent_id, status, selected_at, updated_at)
  values (p_brief_id, v_top_talent, 'selected', v_now, v_now)
  on conflict (brief_id) do update
    set talent_id = excluded.talent_id,
        status = 'selected',
        selected_at = excluded.selected_at,
        updated_at = excluded.updated_at;

  if v_brief.status = 'proposal_sent' then
    update public.briefs set status = 'buyer_selected', updated_at = v_now where id = p_brief_id;
  end if;
  if v_proposal.status <> 'selected' then
    update public.proposals set status = 'selected', updated_at = v_now where id = p_proposal_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'talentId', talent_id,
    'proposalItemId', proposal_item_id,
    'priorityRank', priority_rank,
    'status', status
  ) order by priority_rank)
  into v_result
  from public.buyer_preferences
  where preference_set_id = v_set_id;

  return jsonb_build_object(
    'briefId', p_brief_id,
    'proposalId', p_proposal_id,
    'preferenceSetId', v_set_id,
    'selectedTalentId', v_top_talent,
    'priorities', coalesce(v_result, '[]'::jsonb),
    'status', 'buyer_selected'
  );
end;
$$;

create or replace function public.ns_close_buyer_preferences_on_secured_booking_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'secured' then
    update public.buyer_preferences
    set status = case when talent_id = new.talent_id then 'secured' else 'superseded' end,
        status_reason = case when talent_id = new.talent_id then 'Booking secured' else 'Another buyer priority became the secured booking' end,
        updated_at = now()
    where brief_id = new.brief_id
      and is_current
      and status in ('ranked','active_priority','fallback');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_close_buyer_preferences_on_secured_booking on public.bookings;
create trigger trg_close_buyer_preferences_on_secured_booking
after insert or update of status on public.bookings
for each row execute function public.ns_close_buyer_preferences_on_secured_booking_v1();

-- Recovery safety: a cancelled original talent must not be re-ranked in its own recovery brief.
drop trigger if exists trg_recovery_guard_buyer_preferences on public.buyer_preferences;
create trigger trg_recovery_guard_buyer_preferences
before insert or update of brief_id,talent_id on public.buyer_preferences
for each row execute function public.ns_guard_recovery_original_talent_v1();

revoke all on table public.buyer_preferences from anon, authenticated;
revoke all on function public.ns_set_buyer_priorities_v1(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ns_set_buyer_priorities_v1(uuid,uuid,jsonb) to service_role;

comment on table public.buyer_preferences is 'Immutable-history buyer priority sets. Current rank 1 mirrors to buyer_selections for the single active downstream talent; lower ranks remain ordered fallbacks.';
comment on function public.ns_set_buyer_priorities_v1(uuid,uuid,jsonb) is 'Validates and stores 1–3 ordered buyer proposal preferences, then advances only priority 1 into the legacy single-selection flow.';
