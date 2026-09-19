-- Nusantara Star — Professional & Production Partner Engagement V1
-- Run after supabase-supply-services-multivalue-v1.sql.
-- One shared Work Order model; Talent bookings remain separate.

create table if not exists public.supply_engagements (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.talents(id) on delete restrict,
  supply_type text not null check (supply_type in ('professional','production_partner')),
  request_key uuid not null unique,
  work_order_reference text not null unique,
  service_id text not null,
  supply_name_snapshot text not null,
  service_label_snapshot text not null,
  project_name text not null,
  event_date date null,
  city text null,
  scope_of_work text not null,
  deliverables text[] not null default '{}',
  agreed_fee bigint not null check (agreed_fee > 0),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  payment_terms text not null,
  status text not null default 'pending_confirmation' check (status in (
    'pending_confirmation','confirmed','declined','in_progress',
    'awaiting_completion','completed','disputed','cancelled'
  )),
  confirmation_requested_at timestamptz not null default now(),
  supplier_confirmed_at timestamptz null,
  supplier_declined_at timestamptz null,
  supplier_response_note text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supply_engagements_supply
  on public.supply_engagements(supply_id, created_at desc);
create index if not exists idx_supply_engagements_attention
  on public.supply_engagements(status, event_date);

alter table public.supply_engagements enable row level security;
revoke all on table public.supply_engagements from anon, authenticated;
grant all on table public.supply_engagements to service_role;

create or replace function public.ns_validate_supply_engagement_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  supply_row public.talents%rowtype;
begin
  select * into supply_row from public.talents where id = new.supply_id;
  if not found then raise exception 'Supply profile not found'; end if;
  if supply_row.supply_type not in ('professional','production_partner') then
    raise exception 'Talent must use the booking flow';
  end if;
  if supply_row.status <> 'verified' or supply_row.onboarding_status <> 'approved' then
    raise exception 'Supply profile must be approved before a Work Order is created';
  end if;
  if not (new.service_id = any(coalesce(supply_row.supply_service_ids, '{}'))) then
    raise exception 'Work Order service is not registered on this supply profile';
  end if;
  new.supply_type := supply_row.supply_type;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_supply_engagement_v1 on public.supply_engagements;
create trigger trg_validate_supply_engagement_v1
before insert or update of supply_id, service_id on public.supply_engagements
for each row execute function public.ns_validate_supply_engagement_v1();

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
    new.deliverables, new.agreed_fee, new.currency, new.payment_terms
  ) is distinct from row(
    old.supply_id, old.supply_type, old.request_key, old.work_order_reference,
    old.service_id, old.supply_name_snapshot, old.service_label_snapshot,
    old.project_name, old.event_date, old.city, old.scope_of_work,
    old.deliverables, old.agreed_fee, old.currency, old.payment_terms
  ) then
    raise exception 'Work Order snapshot fields are immutable; create a replacement Work Order';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending_confirmation' and new.status in ('confirmed','declined','cancelled')) or
    (old.status = 'confirmed' and new.status in ('in_progress','disputed','cancelled')) or
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

drop trigger if exists trg_protect_supply_engagement_v1 on public.supply_engagements;
create trigger trg_protect_supply_engagement_v1
before update on public.supply_engagements
for each row execute function public.ns_protect_supply_engagement_v1();

comment on table public.supply_engagements is
  'Immutable commercial Work Order snapshot for a Professional or Production Partner engagement. Talent bookings remain in bookings.';
