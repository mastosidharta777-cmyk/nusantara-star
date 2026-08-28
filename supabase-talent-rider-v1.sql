-- Nusantara Star — Talent Rider V1
-- Run after supabase-talent-onboarding-media-v1.sql.

alter table public.talent_assets
  drop constraint if exists talent_assets_asset_type_check;

alter table public.talent_assets
  add constraint talent_assets_asset_type_check
  check (asset_type in (
    'profile_photo',
    'press_photo',
    'live_performance',
    'showreel',
    'event_clip',
    'rider_document'
  ));

-- Private source documents. They are never buyer-visible by default.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-documents',
  'talent-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.talent_assets.asset_type is
  'Profile/media assets plus private rider_document source files. Rider documents must never be buyer-visible.';
