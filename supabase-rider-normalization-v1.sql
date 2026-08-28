create table if not exists public.talent_rider_versions (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  version_no integer not null,
  source_type text not null check (source_type in ('form_text','uploaded_document','merged')),
  source_asset_id uuid null references public.talent_assets(id) on delete set null,
  source_hash text not null,
  source_filename text null,
  source_text text null,
  extraction_status text not null default 'ready' check (extraction_status in ('ready','failed','not_applicable')),
  normalized_data jsonb not null default '{}'::jsonb,
  missing_questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  normalization_source text not null default 'rules' check (normalization_source in ('ai','rules')),
  status text not null default 'needs_talent_input' check (status in ('needs_talent_input','ready_for_admin','admin_approved','superseded')),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  talent_confirmed_at timestamptz null,
  admin_approved_at timestamptz null,
  unique (talent_id, version_no),
  unique (talent_id, source_hash)
);

create unique index if not exists talent_rider_versions_one_current_idx
  on public.talent_rider_versions(talent_id)
  where is_current = true;

create index if not exists talent_rider_versions_talent_idx
  on public.talent_rider_versions(talent_id, version_no desc);

alter table public.talent_rider_versions enable row level security;

comment on table public.talent_rider_versions is
  'Private versioned master rider normalization. Service-role/server access only; no public RLS policies.';
comment on column public.talent_rider_versions.source_text is
  'Private extracted/source rider text used for audit and re-normalization. Never expose to buyer automatically.';
comment on column public.talent_rider_versions.normalized_data is
  'Structured operational rider facts normalized from source without inventing requirements.';
comment on column public.talent_rider_versions.missing_questions is
  'Only the basic operational questions still missing after normalization.';
