-- Nusantara Star — Fresh Supabase Bootstrap V1
-- Run this FIRST on a new/empty Supabase project.
-- It creates the base tables required by the current feature/availability-matching-v1 code.
-- Follow with the incremental V1 SQL files listed in docs/PRD-NUSANTARA-STAR-V1.md build work.

create extension if not exists pgcrypto;

create table if not exists public.talents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  gender text null check (gender is null or gender in ('female','male','mixed','unknown')),
  genres text[] not null default '{}',
  base_city text null,
  service_cities text[] not null default '{}',
  performance_formats text[] not null default '{}',
  event_types text[] not null default '{}',
  audience_tags text[] not null default '{}',
  budget_min bigint null check (budget_min is null or budget_min >= 0),
  budget_max bigint null check (budget_max is null or budget_max >= 0),
  reliability_score numeric(5,2) null,
  last_calendar_updated_at timestamptz null,
  status text not null default 'curated' check (status in ('draft','curated','verified','inactive')),
  public_visible boolean not null default false,
  bio text null,
  profile_image_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_max >= budget_min)
);

create index if not exists idx_talents_status on public.talents(status);
create index if not exists idx_talents_category on public.talents(category);

create table if not exists public.talent_availability (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  event_date date not null,
  status text not null check (status in ('available','tentative','unavailable','unknown')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (talent_id, event_date)
);

create index if not exists idx_talent_availability_event_date on public.talent_availability(event_date);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  event_type text null,
  event_date date null,
  city text null,
  venue text null,
  audience_size integer null check (audience_size is null or audience_size >= 0),
  talent_category text null,
  genre_style text[] not null default '{}',
  budget_min bigint null check (budget_min is null or budget_min >= 0),
  budget_max bigint null check (budget_max is null or budget_max >= 0),
  performance_duration_minutes integer null check (performance_duration_minutes is null or performance_duration_minutes > 0),
  event_vibe text[] not null default '{}',
  special_requirements text[] not null default '{}',
  source_text text null,
  field_evidence jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in (
    'new','reviewing','matching','availability_check','shortlisted','proposal_sent',
    'buyer_selected','terms_agreed','booked','closed','cancelled'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_max >= budget_min)
);

create index if not exists idx_briefs_status on public.briefs(status);
create index if not exists idx_briefs_event_date on public.briefs(event_date);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  score numeric(6,2) not null default 0,
  tier text not null,
  availability_status text not null default 'unknown',
  availability_freshness text not null default 'never_updated',
  requires_live_confirmation boolean not null default true,
  score_breakdown jsonb null,
  reasons text[] not null default '{}',
  engine_version text null,
  generated_at timestamptz null,
  admin_approved boolean not null default false,
  admin_rejected boolean not null default false,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, talent_id),
  check (not (admin_approved and admin_rejected))
);

create index if not exists idx_match_results_brief_id on public.match_results(brief_id);
create index if not exists idx_match_results_talent_id on public.match_results(talent_id);
create index if not exists idx_match_results_brief_generated on public.match_results(brief_id, generated_at);

create table if not exists public.availability_requests (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  match_result_id uuid null references public.match_results(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','tentative','unavailable','no_response')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, talent_id)
);

create index if not exists idx_availability_requests_brief_id on public.availability_requests(brief_id);
create index if not exists idx_availability_requests_talent_id on public.availability_requests(talent_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null unique references public.briefs(id) on delete restrict,
  talent_id uuid not null references public.talents(id) on delete restrict,
  event_date date not null,
  venue text null,
  city text null,
  buyer_price bigint null check (buyer_price is null or buyer_price >= 0),
  talent_payable bigint null check (talent_payable is null or talent_payable >= 0),
  direct_cost bigint not null default 0 check (direct_cost >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bookings_talent_id on public.bookings(talent_id);
create index if not exists idx_bookings_event_date on public.bookings(event_date);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  payment_type text not null check (payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment','other')),
  amount bigint not null check (amount >= 0),
  provider text null,
  provider_reference text null,
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_booking_id on public.payments(booking_id);
create index if not exists idx_payments_status on public.payments(status);

alter table public.talents enable row level security;
alter table public.talent_availability enable row level security;
alter table public.briefs enable row level security;
alter table public.match_results enable row level security;
alter table public.availability_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;

comment on table public.briefs is 'Buyer brief source-of-truth record for the current V1 workflow.';
comment on table public.match_results is 'Persisted/versioned matching snapshot plus admin review state.';
comment on table public.availability_requests is 'Live talent/manager availability confirmation request state.';
comment on table public.bookings is 'Booking transaction snapshot. Buyer selection alone is not a secured booking.';
comment on table public.payments is 'Actual buyer payment transaction records; separate from planned payment milestones.';
