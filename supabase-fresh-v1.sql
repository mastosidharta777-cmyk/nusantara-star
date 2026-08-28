-- Nusantara Star — ONE-SHOT FRESH SUPABASE V1
-- Use on a NEW/EMPTY Supabase project.
-- This consolidates the current schema needed by feature/availability-matching-v1.

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
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_max >= budget_min),
  constraint briefs_status_check check (status in (
    'new','reviewing','matching','availability_check','shortlisted','proposal_sent',
    'buyer_selected','terms_agreed','booked','closed','cancelled'
  ))
);

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

create table if not exists public.buyer_selections (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  status text not null default 'selected' check (status in ('selected','withdrawn')),
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id)
);

create table if not exists public.commercial_terms (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null unique references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete restrict,
  buyer_price bigint not null check (buyer_price >= 0),
  talent_payable bigint not null check (talent_payable >= 0),
  direct_costs bigint not null default 0 check (direct_costs >= 0),
  taxes_and_payment_fees bigint not null default 0 check (taxes_and_payment_fees >= 0),
  payment_terms text null,
  buyer_payment_terms text null,
  talent_payment_terms text null,
  buyer_payment_schedule jsonb not null default '[]'::jsonb,
  talent_payment_schedule jsonb not null default '[]'::jsonb,
  cancellation_terms text null,
  rider_notes text null,
  special_conditions text null,
  notes text null,
  status text not null default 'draft' check (status in ('draft','agreed')),
  agreed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_price >= talent_payable + direct_costs + taxes_and_payment_fees)
);

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

create table if not exists public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  party text not null check (party in ('buyer','talent')),
  milestone_type text not null check (milestone_type in ('booking_fee','deposit','balance','full_payment','other')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  calculation_type text not null check (calculation_type in ('percentage','fixed_amount','remaining_balance')),
  percentage numeric(5,2) null check (percentage is null or (percentage >= 0 and percentage <= 100)),
  amount bigint null check (amount is null or amount >= 0),
  due_basis text not null check (due_basis in ('booking_date','event_date','event_completion','invoice_date','custom_date')),
  due_offset_days integer not null default 0,
  custom_due_date date null,
  refundable boolean null,
  cancellation_note text null,
  status text not null default 'planned' check (status in ('planned','due','paid','waived','cancelled')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_milestones_value_check check (
    (calculation_type = 'percentage' and percentage is not null and amount is null)
    or (calculation_type = 'fixed_amount' and amount is not null and percentage is null)
    or (calculation_type = 'remaining_balance' and percentage is null and amount is null)
  ),
  constraint payment_milestones_custom_date_check check (
    (due_basis = 'custom_date' and custom_due_date is not null)
    or (due_basis <> 'custom_date' and custom_due_date is null)
  )
);

create table if not exists public.talent_payment_policy_templates (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  milestone_type text not null check (milestone_type in ('booking_fee','deposit','balance','full_payment','other')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  calculation_type text not null check (calculation_type in ('percentage','fixed_amount','remaining_balance')),
  percentage numeric(5,2) null check (percentage is null or (percentage >= 0 and percentage <= 100)),
  amount bigint null check (amount is null or amount >= 0),
  due_basis text not null check (due_basis in ('booking_date','event_date','event_completion','invoice_date')),
  due_offset_days integer not null default 0,
  refundable boolean null,
  cancellation_note text null,
  negotiable boolean not null default true,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_payment_policy_templates_value_check check (
    (calculation_type = 'percentage' and percentage is not null and amount is null)
    or (calculation_type = 'fixed_amount' and amount is not null and percentage is null)
    or (calculation_type = 'remaining_balance' and percentage is null and amount is null)
  )
);

create table if not exists public.talent_media (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  media_type text not null check (media_type in ('live_performance','showreel','event_clip','other')),
  provider text not null check (provider in ('youtube_unlisted','internal_storage')),
  media_url text not null,
  title text null,
  description text null,
  buyer_visible boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 1 check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talents_status on public.talents(status);
create index if not exists idx_talents_category on public.talents(category);
create index if not exists idx_talent_availability_event_date on public.talent_availability(event_date);
create index if not exists idx_briefs_status on public.briefs(status);
create index if not exists idx_briefs_event_date on public.briefs(event_date);
create index if not exists idx_match_results_brief_id on public.match_results(brief_id);
create index if not exists idx_match_results_talent_id on public.match_results(talent_id);
create index if not exists idx_match_results_brief_generated on public.match_results(brief_id, generated_at);
create index if not exists idx_availability_requests_brief_id on public.availability_requests(brief_id);
create index if not exists idx_availability_requests_talent_id on public.availability_requests(talent_id);
create index if not exists idx_buyer_selections_talent_id on public.buyer_selections(talent_id);
create index if not exists idx_commercial_terms_talent_id on public.commercial_terms(talent_id);
create index if not exists idx_bookings_talent_id on public.bookings(talent_id);
create index if not exists idx_bookings_event_date on public.bookings(event_date);
create index if not exists idx_payments_booking_id on public.payments(booking_id);
create index if not exists idx_payments_status on public.payments(status);
create unique index if not exists idx_payment_milestones_booking_party_sequence on public.payment_milestones(booking_id, party, sequence_no);
create index if not exists idx_payment_milestones_booking on public.payment_milestones(booking_id);
create index if not exists idx_payment_milestones_status on public.payment_milestones(status);
create unique index if not exists idx_talent_payment_policy_templates_talent_sequence on public.talent_payment_policy_templates(talent_id, sequence_no) where is_active = true;
create index if not exists idx_talent_payment_policy_templates_talent on public.talent_payment_policy_templates(talent_id);
create index if not exists idx_talent_media_talent on public.talent_media(talent_id);
create index if not exists idx_talent_media_buyer_visible on public.talent_media(talent_id, buyer_visible, is_active);

alter table public.talents enable row level security;
alter table public.talent_availability enable row level security;
alter table public.briefs enable row level security;
alter table public.match_results enable row level security;
alter table public.availability_requests enable row level security;
alter table public.buyer_selections enable row level security;
alter table public.commercial_terms enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.payment_milestones enable row level security;
alter table public.talent_payment_policy_templates enable row level security;
alter table public.talent_media enable row level security;

comment on column public.briefs.source_text is 'Original buyer/admin brief text used to create the structured brief.';
comment on column public.briefs.field_evidence is 'Per-field evidence metadata: explicit, normalized, inferred_review, missing.';
comment on column public.match_results.engine_version is 'Matching engine version for the frozen generated snapshot.';
comment on table public.payment_milestones is 'Planned buyer/talent payment schedule; separate from actual payment transactions.';
comment on table public.talent_payment_policy_templates is 'Reusable talent/management payment policy defaults; booking terms remain event-specific.';
comment on table public.talent_media is 'Curated buyer-facing/internal talent media controlled by Nusantara Star.';
