-- Nusantara Star — YouTube Embed Onboarding V1
-- Additive migration. Run as a NEW query before testing this application release.

begin;

alter table public.talent_assets
  drop constraint if exists talent_assets_provider_check;

alter table public.talent_assets
  add constraint talent_assets_provider_check
  check (provider in ('supabase_storage','cloudflare_r2','youtube_unlisted'));

comment on column public.talent_assets.provider is
  'Media source. YouTube links are stored as reviewed external media; uploaded files remain in Supabase Storage or Cloudflare R2.';

comment on column public.talent_assets.storage_key is
  'Storage object key for uploaded media, or talent_id/video_id for provider youtube_unlisted.';

create or replace function public.ns_youtube_embed_onboarding_ready_v1()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_assets'::regclass
      and conname = 'talent_assets_provider_check'
      and pg_get_constraintdef(oid) like '%youtube_unlisted%'
  );
$$;

revoke all on function public.ns_youtube_embed_onboarding_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_youtube_embed_onboarding_ready_v1() to service_role;

commit;

select public.ns_youtube_embed_onboarding_ready_v1() as youtube_embed_onboarding_ready;
