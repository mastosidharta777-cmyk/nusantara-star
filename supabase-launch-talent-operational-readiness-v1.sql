-- Nusantara Star — Launch Readiness: Talent Operational Basics V1
-- Run after the existing onboarding / atomic approval migrations.
-- Baseline fee is internal matching guidance only. Event-specific confirmed fee remains sourced from Talent Offer.

comment on column public.talents.budget_min is
  'Internal indicative minimum fee used for initial matching only. Not an event-specific quote and not buyer-facing by default.';
comment on column public.talents.budget_max is
  'Internal indicative maximum fee used for initial matching only. Event-specific fee must be confirmed separately by talent/management.';
comment on column public.talents.last_calendar_updated_at is
  'Timestamp when Nusantara Star last confirmed the talent availability/calendar information with talent or management. Exact event dates may still require live confirmation.';

create or replace function public.ns_update_talent_operational_basics_v1(
  p_talent_id uuid,
  p_base_city text,
  p_budget_min bigint,
  p_budget_max bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  city text := nullif(btrim(p_base_city), '');
begin
  if city is null then raise exception 'Kota basis wajib diisi'; end if;
  if p_budget_min is null or p_budget_min <= 0 then raise exception 'Fee indikatif minimum harus lebih besar dari nol'; end if;
  if p_budget_max is null or p_budget_max < p_budget_min then raise exception 'Fee indikatif maksimum harus sama atau lebih besar dari minimum'; end if;

  perform 1 from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  update public.talents
  set base_city = city,
      budget_min = p_budget_min,
      budget_max = p_budget_max,
      updated_at = now()
  where id = p_talent_id;

  -- Keep staged onboarding city aligned when a submission exists. Fee remains admin-curated on talents only.
  update public.talent_profile_submissions
  set base_city = city,
      updated_at = now()
  where talent_id = p_talent_id;

  return jsonb_build_object(
    'ok', true,
    'baseCity', city,
    'budgetMin', p_budget_min,
    'budgetMax', p_budget_max
  );
end;
$$;

create or replace function public.ns_confirm_talent_availability_review_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  confirmed_at timestamptz := now();
begin
  perform 1 from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  update public.talents
  set last_calendar_updated_at = confirmed_at,
      updated_at = confirmed_at
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'confirmedAt', confirmed_at);
end;
$$;

-- Harden profile approval: a public/verified talent must also be usable by the matching engine.
create or replace function public.ns_approve_talent_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  s public.talent_profile_submissions%rowtype;
  rider_status text;
  has_rider boolean := false;
  has_photo boolean := false;
  has_video boolean := false;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  select * into s
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found or s.status <> 'submitted' then
    raise exception 'Profil belum berstatus sudah dikirim';
  end if;

  if nullif(btrim(s.base_city), '') is null then
    raise exception 'Kota basis wajib dilengkapi sebelum profil disetujui';
  end if;

  if t.budget_min is null or t.budget_min <= 0 or t.budget_max is null or t.budget_max < t.budget_min then
    raise exception 'Atur kisaran fee indikatif internal yang valid sebelum profil disetujui';
  end if;

  select exists(
    select 1 from public.talent_assets
    where talent_id = p_talent_id and asset_type = 'profile_photo'
      and upload_status = 'uploaded' and review_status = 'approved' and buyer_visible = true
  ) into has_photo;

  select exists(
    select 1 from public.talent_assets
    where talent_id = p_talent_id and asset_type in ('live_performance','showreel','event_clip')
      and upload_status = 'uploaded' and review_status = 'approved' and buyer_visible = true
  ) into has_video;

  if not has_photo or not has_video then
    raise exception 'Setujui minimal 1 foto profil dan 1 video terlebih dahulu';
  end if;

  select true, status into has_rider, rider_status
  from public.talent_rider_versions
  where talent_id = p_talent_id and is_current = true
  for update;

  if has_rider and rider_status <> 'admin_approved' then
    raise exception 'Setujui rider utama terlebih dahulu sebelum profil dipublikasikan';
  end if;

  update public.talents set
    name = s.name,
    category = s.category,
    act_type = s.act_type,
    base_city = s.base_city,
    genres = s.genres,
    music_styles = coalesce(s.music_styles, '{}'),
    vibe_tags = coalesce(s.vibe_tags, '{}'),
    capability_tags = coalesce(s.capability_tags, '{}'),
    service_cities = s.service_cities,
    performance_formats = s.performance_formats,
    event_types = s.event_types,
    bio = s.bio,
    show_duration_minutes = s.show_duration_minutes,
    manager_name = s.manager_name,
    manager_email = s.manager_email,
    manager_whatsapp = s.manager_whatsapp,
    instagram_url = s.instagram_url,
    tiktok_url = s.tiktok_url,
    youtube_url = s.youtube_url,
    base_rider = s.base_rider,
    travel_policy = s.travel_policy,
    accommodation_policy = s.accommodation_policy,
    onboarding_status = 'approved',
    onboarding_approved_at = now(),
    status = 'verified',
    public_visible = true,
    updated_at = now()
  where id = p_talent_id;

  update public.talent_profile_submissions
  set status = 'approved', rejection_note = null, reviewed_at = now(), updated_at = now()
  where talent_id = p_talent_id and status = 'submitted';

  if not found then raise exception 'Profil berubah saat disetujui. Muat ulang dan coba lagi.'; end if;
  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$$;

revoke all on function public.ns_update_talent_operational_basics_v1(uuid,text,bigint,bigint) from public, anon, authenticated;
revoke all on function public.ns_confirm_talent_availability_review_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_approve_talent_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_update_talent_operational_basics_v1(uuid,text,bigint,bigint) to service_role;
grant execute on function public.ns_confirm_talent_availability_review_v1(uuid) to service_role;
grant execute on function public.ns_approve_talent_profile_v1(uuid) to service_role;
