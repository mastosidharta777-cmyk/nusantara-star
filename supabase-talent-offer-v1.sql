-- Nusantara Star — Talent Offer V1
-- Run once on the current Supabase project before testing Phase 2.

create table if not exists public.talent_offers (
  id uuid primary key default gen_random_uuid(),
  availability_request_id uuid not null unique references public.availability_requests(id) on delete cascade,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  status text not null check (status in ('confirmed','changed','unavailable','expired')),
  availability_status text not null check (availability_status in ('confirmed','tentative','unavailable')),
  event_fee bigint null check (event_fee is null or event_fee >= 0),
  currency text not null default 'IDR',
  included_costs text null,
  excluded_costs text null,
  payment_terms text null,
  rider_exceptions text null,
  quote_valid_until timestamptz null,
  confirmation_source text not null default 'manager_portal',
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_offer_confirmed_fee_check check (
    availability_status <> 'confirmed' or (event_fee is not null and event_fee > 0)
  )
);

create index if not exists idx_talent_offers_brief_id on public.talent_offers(brief_id);
create index if not exists idx_talent_offers_talent_id on public.talent_offers(talent_id);
create index if not exists idx_talent_offers_valid_until on public.talent_offers(quote_valid_until);

alter table public.talent_offers enable row level security;

comment on table public.talent_offers is
  'Event-specific commercial snapshot confirmed by talent/manager. Source of truth for proposal pricing inputs, separate from reusable talent profile defaults.';
comment on column public.talent_offers.event_fee is
  'Event-specific fee confirmed by talent/management for this brief. Never inferred from the generic profile rate.';
comment on column public.talent_offers.quote_valid_until is
  'Offer validity timestamp. Expired offers require reconfirmation before buyer proposal or booking.';
