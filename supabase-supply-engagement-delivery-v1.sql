-- Nusantara Star — Supply Engagement Delivery & Acceptance V1
-- Run after supabase-supply-engagement-v1.sql.
-- Keeps the commercial Work Order immutable while recording only contractual delivery signals.

alter table public.supply_engagements
  add column if not exists delivery_due_at timestamptz null,
  add column if not exists supplier_delivery_url text null,
  add column if not exists supplier_delivery_note text null,
  add column if not exists supplier_delivery_submitted_at timestamptz null;

create index if not exists idx_supply_engagements_delivery_attention
  on public.supply_engagements(status, delivery_due_at)
  where status in ('confirmed', 'in_progress', 'awaiting_completion');

create table if not exists public.supply_engagement_delivery_actions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.supply_engagements(id) on delete restrict,
  actor text not null check (actor in ('supplier', 'admin')),
  action text not null check (action in ('work_started', 'delivery_submitted', 'revision_requested', 'delivery_accepted')),
  note text null check (note is null or char_length(note) <= 4000),
  delivery_url text null check (delivery_url is null or delivery_url ~ '^https?://'),
  created_at timestamptz not null default now(),
  check (
    (action = 'work_started' and actor in ('supplier', 'admin') and delivery_url is null) or
    (action = 'delivery_submitted' and actor = 'supplier' and delivery_url is not null) or
    (action in ('revision_requested', 'delivery_accepted') and actor = 'admin' and delivery_url is null)
  )
);

create index if not exists idx_supply_engagement_delivery_actions_engagement
  on public.supply_engagement_delivery_actions(engagement_id, created_at asc);

alter table public.supply_engagement_delivery_actions enable row level security;
revoke all on table public.supply_engagement_delivery_actions from anon, authenticated;
grant all on table public.supply_engagement_delivery_actions to service_role;

create or replace function public.ns_prevent_supply_delivery_action_mutation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Delivery action history is append-only';
end;
$$;

drop trigger if exists trg_prevent_supply_delivery_action_mutation_v1 on public.supply_engagement_delivery_actions;
create trigger trg_prevent_supply_delivery_action_mutation_v1
before update or delete on public.supply_engagement_delivery_actions
for each row execute function public.ns_prevent_supply_delivery_action_mutation_v1();

create or replace function public.ns_protect_supply_engagement_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.supply_id, new.supply_type, new.request_key, new.work_order_reference,
    new.service_id, new.supply_name_snapshot, new.service_label_snapshot,
    new.project_name, new.event_date, new.city, new.scope_of_work,
    new.deliverables, new.agreed_fee, new.currency, new.payment_terms,
    new.delivery_due_at
  ) is distinct from row(
    old.supply_id, old.supply_type, old.request_key, old.work_order_reference,
    old.service_id, old.supply_name_snapshot, old.service_label_snapshot,
    old.project_name, old.event_date, old.city, old.scope_of_work,
    old.deliverables, old.agreed_fee, old.currency, old.payment_terms,
    old.delivery_due_at
  ) then
    raise exception 'Work Order snapshot fields are immutable; create a replacement Work Order';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending_confirmation' and new.status in ('confirmed','declined','cancelled')) or
    (old.status = 'confirmed' and new.status in ('in_progress','awaiting_completion','disputed','cancelled')) or
    (old.status = 'in_progress' and new.status in ('awaiting_completion','disputed','cancelled')) or
    (old.status = 'awaiting_completion' and new.status in ('in_progress','completed','disputed')) or
    (old.status = 'disputed' and new.status in ('in_progress','awaiting_completion','completed','cancelled'))
  ) then
    raise exception 'Invalid Work Order status transition: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ns_supplier_delivery_action_v1(
  p_engagement_id uuid,
  p_action text,
  p_note text default null,
  p_delivery_url text default null
)
returns public.supply_engagements
language plpgsql
set search_path = public
as $$
declare
  row_before public.supply_engagements%rowtype;
  row_after public.supply_engagements%rowtype;
  clean_note text := nullif(btrim(p_note), '');
  clean_url text := nullif(btrim(p_delivery_url), '');
begin
  select * into row_before from public.supply_engagements where id = p_engagement_id for update;
  if not found then raise exception 'Work Order not found'; end if;

  if p_action = 'start' then
    if row_before.status <> 'confirmed' then raise exception 'Work Order is not ready to start'; end if;
    update public.supply_engagements
      set status = 'in_progress', started_at = coalesce(started_at, now())
      where id = p_engagement_id
      returning * into row_after;
    insert into public.supply_engagement_delivery_actions(engagement_id, actor, action, note)
      values (p_engagement_id, 'supplier', 'work_started', clean_note);
  elsif p_action = 'submit_delivery' then
    if row_before.status not in ('confirmed', 'in_progress') then raise exception 'Work Order is not ready for delivery'; end if;
    if clean_url is null or clean_url !~ '^https?://' then raise exception 'A valid HTTPS or HTTP delivery link is required'; end if;
    update public.supply_engagements
      set status = 'awaiting_completion',
          started_at = coalesce(started_at, now()),
          supplier_delivery_url = clean_url,
          supplier_delivery_note = clean_note,
          supplier_delivery_submitted_at = now()
      where id = p_engagement_id
      returning * into row_after;
    insert into public.supply_engagement_delivery_actions(engagement_id, actor, action, note, delivery_url)
      values (p_engagement_id, 'supplier', 'delivery_submitted', clean_note, clean_url);
  else
    raise exception 'Unknown supplier delivery action';
  end if;

  return row_after;
end;
$$;

create or replace function public.ns_admin_delivery_action_v1(
  p_engagement_id uuid,
  p_action text,
  p_note text default null
)
returns public.supply_engagements
language plpgsql
set search_path = public
as $$
declare
  row_before public.supply_engagements%rowtype;
  row_after public.supply_engagements%rowtype;
  clean_note text := nullif(btrim(p_note), '');
begin
  select * into row_before from public.supply_engagements where id = p_engagement_id for update;
  if not found then raise exception 'Work Order not found'; end if;

  if p_action = 'start' then
    if row_before.status <> 'confirmed' then raise exception 'Work Order is not ready to start'; end if;
    update public.supply_engagements
      set status = 'in_progress', started_at = coalesce(started_at, now())
      where id = p_engagement_id
      returning * into row_after;
    insert into public.supply_engagement_delivery_actions(engagement_id, actor, action, note)
      values (p_engagement_id, 'admin', 'work_started', clean_note);
  elsif p_action = 'request_revision' then
    if row_before.status <> 'awaiting_completion' then raise exception 'No submitted delivery is awaiting review'; end if;
    if clean_note is null then raise exception 'Revision instructions are required'; end if;
    update public.supply_engagements set status = 'in_progress' where id = p_engagement_id returning * into row_after;
    insert into public.supply_engagement_delivery_actions(engagement_id, actor, action, note)
      values (p_engagement_id, 'admin', 'revision_requested', clean_note);
  elsif p_action = 'accept' then
    if row_before.status <> 'awaiting_completion' then raise exception 'No submitted delivery is awaiting acceptance'; end if;
    update public.supply_engagements set status = 'completed', completed_at = now() where id = p_engagement_id returning * into row_after;
    insert into public.supply_engagement_delivery_actions(engagement_id, actor, action, note)
      values (p_engagement_id, 'admin', 'delivery_accepted', clean_note);
  else
    raise exception 'Unknown admin delivery action';
  end if;

  return row_after;
end;
$$;

revoke all on function public.ns_supplier_delivery_action_v1(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ns_admin_delivery_action_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ns_supplier_delivery_action_v1(uuid, text, text, text) to service_role;
grant execute on function public.ns_admin_delivery_action_v1(uuid, text, text) to service_role;

comment on table public.supply_engagement_delivery_actions is
  'Append-only operational history for supplier delivery, revision requests, and agency acceptance. Not a chat channel.';
