-- Nusantara Star — Talent Onboarding & Media V1
-- Run after supabase-operations-v1.sql.

alter table public.talents
  add column if not exists manager_name text null,
  add column if not exists manager_email text null,
  add column if not exists manager_whatsapp text null,
  add column if not exists instagram_url text null,
  add column if not exists tiktok_url text null,
  add column if not exists youtube_url text null,
  add column if not exists show_duration_minutes integer null,
  add column if not exists base_rider text null,
  add column if not exists travel_policy text null,
  add column if not exists accommodation_policy text null,
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists onboarding_approved_at timestamptz null;

alter table public.talents drop constraint if exists talents_onboarding_status_check;
alter table public.talents add constraint talents_onboarding_status_check
  check (onboarding_status in ('not_started','in_progress','submitted','approved','rejected'));

alter table public.talents drop constraint if exists talents_show_duration_minutes_check;
alter table public.talents add constraint talents_show_duration_minutes_check
  check (show_duration_minutes is null or show_duration_minutes > 0);

create table if not exists public.talent_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null unique references public.talents(id) on delete cascade,
  name text not null,
  category text not null,
  base_city text null,
  genres text[] not null default '{}',
  service_cities text[] not null default '{}',
  performance_formats text[] not null default '{}',
  event_types text[] not null default '{}',
  bio text null,
  show_duration_minutes integer null check (show_duration_minutes is null or show_duration_minutes > 0),
  manager_name text null,
  manager_email text null,
  manager_whatsapp text null,
  instagram_url text null,
  tiktok_url text null,
  youtube_url text null,
  base_rider text null,
  travel_policy text null,
  accommodation_policy text null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  rejection_note text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_assets (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  asset_type text not null check (asset_type in ('profile_photo','press_photo','live_performance','showreel','event_clip')),
  provider text not null check (provider in ('supabase_storage','cloudflare_r2')),
  storage_key text not null,
  original_filename text null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  title text null,
  description text null,
  upload_status text not null default 'pending_upload' check (upload_status in ('pending_upload','uploaded')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  buyer_visible boolean not null default false,
  sort_order integer not null default 1 check (sort_order > 0),
  uploaded_at timestamptz null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, storage_key)
);

create index if not exists idx_talent_profile_submissions_status on public.talent_profile_submissions(status);
create index if not exists idx_talent_assets_talent on public.talent_assets(talent_id, sort_order);
create index if not exists idx_talent_assets_review on public.talent_assets(talent_id, review_status, buyer_visible);

alter table public.talent_profile_submissions enable row level security;
alter table public.talent_assets enable row level security;

-- Private photo bucket. Uploads happen only through short-lived signed upload tokens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-photos',
  'talent-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.talent_profile_submissions is 'Staging profile submitted by talent/manager. Nothing becomes buyer-visible until admin approval.';
comment on table public.talent_assets is 'Talent photos/videos uploaded through Nusantara Star. Admin approval is required before buyer visibility.';
comment on column public.talents.manager_whatsapp is 'Internal management contact. Never expose to buyer-facing payloads.';
