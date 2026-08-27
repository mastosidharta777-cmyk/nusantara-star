-- Nusantara Star — Atomic Onboarding Approval V1
-- Makes rider approval and profile approval/rejection transactional and service-role only.

create or replace function public.ns_approve_talent_rider_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.talent_rider_versions%rowtype;
begin
  select * into r
  from public.talent_rider_versions
  where talent_id = p_talent_id and is_current = true
  for update;

  if not found then raise exception 'Belum ada rider utama untuk ditinjau'; end if;
  if r.status = 'admin_approved' then
    return jsonb_build_object('ok', true, 'alreadyApproved', true, 'riderId', r.id);
  end if;
  if r.status = 'needs_talent_input' or jsonb_array_length(coalesce(r.missing_questions, '[]'::jsonb)) > 0 then
    raise exception 'Rider belum lengkap. Minta talent melengkapi pertanyaan yang masih terbuka.';
  end if;
  if r.status <> 'ready_for_admin' then raise exception 'Rider belum siap ditinjau admin'; end if;

  update public.talent_rider_versions
  set status = 'admin_approved', admin_approved_at = now(), updated_at = now()
  where id = r.id and status = 'ready_for_admin';

  if not found then raise exception 'Rider berubah saat ditinjau. Muat ulang dan coba lagi.'; end if;
  return jsonb_build_object('ok', true, 'alreadyApproved', false, 'riderId', r.id);
end;
$$;

create or replace function public.ns_reject_talent_profile_v1(p_talent_id uuid, p_rejection_note text default 'Perlu revisi')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.talent_profile_submissions%rowtype;
  note text := coalesce(nullif(btrim(p_rejection_note), ''), 'Perlu revisi');
begin
  select * into s from public.talent_profile_submissions where talent_id = p_talent_id for update;
  if not found then raise exception 'Profil onboarding tidak ditemukan'; end if;

  perform 1 from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  update public.talent_profile_submissions
  set status = 'rejected', rejection_note = note, reviewed_at = now(), updated_at = now()
  where talent_id = p_talent_id;

  update public.talents
  set onboarding_status = 'rejected', public_visible = false, updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

create or replace function public.ns_approve_talent_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.talent_profile_submissions%rowtype;
  rider_status text;
  has_rider boolean := false;
  has_photo boolean := false;
  has_video boolean := false;
begin
  perform 1 from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  select * into s
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found or s.status <> 'submitted' then
    raise exception 'Profil belum berstatus sudah dikirim';
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

revoke all on function public.ns_approve_talent_rider_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_reject_talent_profile_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.ns_approve_talent_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_approve_talent_rider_v1(uuid) to service_role;
grant execute on function public.ns_reject_talent_profile_v1(uuid, text) to service_role;
grant execute on function public.ns_approve_talent_profile_v1(uuid) to service_role;
