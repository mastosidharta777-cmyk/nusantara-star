-- Nusantara Star — controlled public roster-interest intake V1
-- Public visitors write through the server route only; there is no anon/authenticated table policy.
create table if not exists public.supply_interest_submissions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  supply_type text not null check (supply_type in ('talent', 'professional', 'production_partner')),
  source text not null default 'coming_soon' check (source in ('coming_soon')),
  status text not null default 'new' check (status in ('new', 'invited', 'archived')),
  created_at timestamptz not null default now(),
  unique (email, supply_type)
);
alter table public.supply_interest_submissions enable row level security;
revoke all on table public.supply_interest_submissions from anon, authenticated;
grant select, insert, update, delete on table public.supply_interest_submissions to service_role;
comment on table public.supply_interest_submissions is 'Private roster-interest emails collected during public launch control. A submission never creates a public profile or an onboarding record automatically.';
