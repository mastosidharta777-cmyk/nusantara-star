-- Nusantara Star — Internal Supply Rate Card V1
-- Run after supabase-supply-audio-services-v1.sql.
-- V1 is deliberately limited to songwriting and studio-audio services.

create table if not exists public.supply_service_rate_cards (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.talents(id) on delete restrict,
  service_id text not null check (service_id in ('songwriter_topliner','recording_engineer','mixing_engineer','mastering_engineer')),
  currency text not null default 'IDR' check (currency = 'IDR'),
  pricing_unit text not null check (pricing_unit in ('per_song','per_hour','per_session','per_project')),
  starting_fee bigint not null check (starting_fee > 0),
  included_scope text not null check (nullif(btrim(included_scope), '') is not null),
  maximum_track_count integer null check (maximum_track_count is null or maximum_track_count between 1 and 500),
  maximum_stem_count integer null check (maximum_stem_count is null or maximum_stem_count between 1 and 100),
  included_revisions integer not null default 1 check (included_revisions between 0 and 10),
  turnaround_days integer null check (turnaround_days is null or turnaround_days between 1 and 90),
  add_on_policy text null,
  batch_discount_policy text null,
  quote_required_conditions text not null check (nullif(btrim(quote_required_conditions), '') is not null),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supply_id, service_id)
);

create index if not exists idx_supply_service_rate_cards_supply
  on public.supply_service_rate_cards(supply_id, status, updated_at desc);

alter table public.supply_service_rate_cards enable row level security;
revoke all on table public.supply_service_rate_cards from anon, authenticated;
grant all on table public.supply_service_rate_cards to service_role;

create or replace function public.ns_validate_supply_service_rate_card_v1()
returns trigger language plpgsql set search_path = public as $$
declare supply_row public.talents%rowtype;
begin
  select * into supply_row from public.talents where id = new.supply_id;
  if not found then raise exception 'Supply profile not found'; end if;
  if supply_row.supply_type <> 'professional' then raise exception 'Rate Card V1 is only available for Professional supply'; end if;
  if supply_row.status <> 'verified' or supply_row.onboarding_status <> 'approved' then raise exception 'Supply profile must be approved before a Rate Card is saved'; end if;
  if not (new.service_id = any(coalesce(supply_row.supply_service_ids, '{}'))) then raise exception 'Rate Card service is not registered on this supply profile'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_supply_service_rate_card_v1 on public.supply_service_rate_cards;
create trigger trg_validate_supply_service_rate_card_v1
before insert or update on public.supply_service_rate_cards
for each row execute function public.ns_validate_supply_service_rate_card_v1();

comment on table public.supply_service_rate_cards is
  'Internal price guidance only. Buyer-facing price and final commercial commitment remain in the immutable Work Order.';
