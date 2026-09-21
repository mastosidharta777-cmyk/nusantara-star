-- Nusantara Star — Talent external media V1
-- Controlled provider allow-list: SoundCloud player and Instagram post/Reel link.

alter table public.talent_assets
  drop constraint if exists talent_assets_provider_check;

alter table public.talent_assets
  add constraint talent_assets_provider_check
  check (provider in ('supabase_storage', 'cloudflare_r2', 'youtube_unlisted', 'soundcloud', 'instagram'));

comment on column public.talent_assets.provider is
  'Media source. Only explicit provider allow-list is accepted; public rendering must never iframe arbitrary URLs.';
