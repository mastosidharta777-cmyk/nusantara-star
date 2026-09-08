-- Nusantara Star — Replacement Recovery Foundation V1
-- Additive foundation for talent-cancellation recovery.
-- Reuses the existing Brief -> Matching -> Availability -> Talent Offer -> Proposal -> Deal -> Booking flow.
-- The original booking remains immutable while a separate recovery brief advances through replacement selection.

create table if not exists public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  original_booking_id uuid not null references public.bookings(id) on delete restrict,
  incident_id uuid not null unique references public.incidents(id) on delete restrict,
  recovery_brief_id uuid not null unique references public.briefs(id) on delete restrict,
  original_talent_id uuid not null references public.talents(id) on delete restrict,
  status text not null default 'matching' check (status in (
    'matching','confirming','buyer_selection','replacement_selected','reconciling',
    'replacement_secured','closed_no_replacement','void'
  )),
  trigger_reason text not null,
  requirements_snapshot jsonb not null,
  original_booking_snapshot jsonb not null,
  idempotency_key text not null unique,
  match_engine_version text null,
  matching_generated_at timestamptz null,
  match_count integer null check (match_count is null or match_count >= 0),
  selected_replacement_talent_id uuid null references public.talents(id) on delete restrict,
  replacement_booking_id uuid null unique references public.bookings(id) on delete restrict,
  financial_reconciliation_status text not null default 'pending' check (financial_reconciliation_status in ('pending','ready','completed','not_required')),
  financial_reconciliation_notes text null,
  opened_at timestamptz not null default now(),
  replacement_secured_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recovery_cases_booking on public.recovery_cases(original_booking_id);
create index if not exists idx_recovery_cases_status on public.recovery_cases(status);
create index if not exists idx_recovery_cases_recovery_brief on public.recovery_cases(recovery_brief_id);
create unique index if not exists uq_recovery_cases_active_booking
  on public.recovery_cases(original_booking_id)
  where status <> 'void';

alter table public.recovery_cases enable row level security;

create or replace function public.ns_open_recovery_case_v1(
  p_booking_id uuid,
  p_incident_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns public.recovery_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  i public.incidents%rowtype;
  br public.briefs%rowtype;
  t public.talents%rowtype;
  d public.deals%rowtype;
  recovery_brief public.briefs%rowtype;
  existing public.recovery_cases%rowtype;
  result_row public.recovery_cases%rowtype;
  requirements jsonb;
  booking_snapshot jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Recovery reason is required'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.recovery_cases where idempotency_key = trim(p_idempotency_key);
  if found then
    if existing.original_booking_id <> p_booking_id or existing.incident_id <> p_incident_id then
      raise exception 'Idempotency key already used for a different recovery case';
    end if;
    return existing;
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Original booking not found'; end if;
  if b.status <> 'incident' then raise exception 'Original booking must be in incident state before recovery starts'; end if;

  select * into i from public.incidents where id = p_incident_id and booking_id = b.id for update;
  if not found then raise exception 'Talent cancellation incident not found'; end if;
  if i.incident_type <> 'talent_cancellation' then raise exception 'Replacement recovery requires a talent cancellation incident'; end if;
  if i.status <> 'open' then raise exception 'Talent cancellation incident must remain open while recovery is active'; end if;

  if exists (select 1 from public.recovery_cases where original_booking_id = b.id and status <> 'void') then
    raise exception 'An active recovery case already exists for this booking';
  end if;

  select * into br from public.briefs where id = b.brief_id;
  if not found then raise exception 'Original brief not found'; end if;
  select * into t from public.talents where id = b.talent_id;
  if not found then raise exception 'Original talent not found'; end if;
  if b.deal_id is not null then select * into d from public.deals where id = b.deal_id; end if;

  requirements := jsonb_build_object(
    'event_type', br.event_type,
    'event_date', br.event_date,
    'city', br.city,
    'venue', br.venue,
    'audience_size', br.audience_size,
    'talent_category', br.talent_category,
    'genre_style', br.genre_style,
    'budget_min', br.budget_min,
    'budget_max', br.budget_max,
    'performance_duration_minutes', br.performance_duration_minutes,
    'event_vibe', br.event_vibe,
    'special_requirements', br.special_requirements,
    'source_text', br.source_text,
    'field_evidence', br.field_evidence
  );

  booking_snapshot := jsonb_build_object(
    'booking_id', b.id,
    'brief_id', b.brief_id,
    'deal_id', b.deal_id,
    'talent_id', b.talent_id,
    'talent_name', t.name,
    'talent_category', t.category,
    'event_date', b.event_date,
    'city', b.city,
    'venue', b.venue,
    'buyer_price', b.buyer_price,
    'talent_payable', b.talent_payable,
    'direct_cost', b.direct_cost,
    'secured_at', b.secured_at,
    'prior_booking_status', i.prior_booking_status,
    'cancellation_terms', case when b.deal_id is null then null else d.cancellation_terms end,
    'rider_notes', case when b.deal_id is null then null else d.rider_notes end
  );

  insert into public.briefs (
    event_type,event_date,city,venue,audience_size,talent_category,genre_style,
    budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,
    source_text,field_evidence,status,buyer_name,buyer_company,buyer_whatsapp,buyer_email,
    request_mode,requested_talent_id
  ) values (
    br.event_type,br.event_date,br.city,br.venue,br.audience_size,br.talent_category,br.genre_style,
    br.budget_min,br.budget_max,br.performance_duration_minutes,br.event_vibe,br.special_requirements,
    br.source_text,br.field_evidence,'matching',br.buyer_name,br.buyer_company,br.buyer_whatsapp,br.buyer_email,
    'discovery',null
  ) returning * into recovery_brief;

  insert into public.recovery_cases (
    original_booking_id,incident_id,recovery_brief_id,original_talent_id,status,
    trigger_reason,requirements_snapshot,original_booking_snapshot,idempotency_key,opened_at
  ) values (
    b.id,i.id,recovery_brief.id,b.talent_id,'matching',trim(p_reason),requirements,booking_snapshot,trim(p_idempotency_key),now()
  ) returning * into result_row;

  return result_row;
end;
$$;

create or replace function public.ns_guard_recovery_brief_requirements_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.recovery_cases where recovery_brief_id = old.id) then
    if row(
      new.event_type,new.event_date,new.city,new.venue,new.audience_size,new.talent_category,
      new.genre_style,new.budget_min,new.budget_max,new.performance_duration_minutes,new.event_vibe,
      new.special_requirements,new.source_text,new.field_evidence,new.request_mode,new.requested_talent_id
    ) is distinct from row(
      old.event_type,old.event_date,old.city,old.venue,old.audience_size,old.talent_category,
      old.genre_style,old.budget_min,old.budget_max,old.performance_duration_minutes,old.event_vibe,
      old.special_requirements,old.source_text,old.field_evidence,old.request_mode,old.requested_talent_id
    ) then
      raise exception 'Recovery brief requirements are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recovery_brief_requirements_immutable on public.briefs;
create trigger trg_recovery_brief_requirements_immutable
before update on public.briefs
for each row execute function public.ns_guard_recovery_brief_requirements_v1();

revoke all on function public.ns_open_recovery_case_v1(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.ns_open_recovery_case_v1(uuid,uuid,text,text) to service_role;

comment on table public.recovery_cases is 'Replacement recovery orchestration. Original booking stays intact; recovery uses a cloned immutable brief and the normal confirmation/proposal/deal/booking chain.';
comment on function public.ns_open_recovery_case_v1(uuid,uuid,text,text) is 'Opens a talent-cancellation recovery case and atomically clones immutable event requirements into a separate discovery brief.';
