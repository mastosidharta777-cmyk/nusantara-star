-- Nusantara Star — Adaptive Supply Onboarding V1
-- Adds isolated review state transitions for Professional and Production Partner rows.
-- Existing Talent onboarding RPCs remain unchanged.

create or replace function public.ns_submit_supply_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  submission_status text;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then
    raise exception 'Profil supply tidak ditemukan';
  end if;

  select status into submission_status
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found then raise exception 'Profil onboarding tidak ditemukan'; end if;
  if submission_status = 'approved' then raise exception 'Profil sudah disetujui dan tidak dapat dikirim ulang'; end if;
  if submission_status = 'submitted' then return jsonb_build_object('ok', true, 'alreadySubmitted', true, 'status', 'submitted'); end if;
  if submission_status not in ('draft','rejected') then raise exception 'Status profil tidak dapat dikirim untuk ditinjau'; end if;

  update public.talent_profile_submissions
  set status = 'submitted', submitted_at = now(), rejection_note = null, reviewed_at = null, updated_at = now()
  where talent_id = p_talent_id and status in ('draft','rejected');
  if not found then raise exception 'Profil berubah saat dikirim. Muat ulang dan coba lagi.'; end if;

  update public.talents
  set onboarding_status = 'submitted', public_visible = false, updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'alreadySubmitted', false, 'status', 'submitted');
end;
$$;

create or replace function public.ns_reopen_supply_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  submission_status text;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then
    raise exception 'Profil supply tidak ditemukan';
  end if;

  select status into submission_status
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;
  if not found then raise exception 'Profil onboarding tidak ditemukan'; end if;
  if submission_status = 'approved' then raise exception 'Profil sudah disetujui dan tidak dapat ditarik dari portal onboarding'; end if;

  if submission_status in ('draft','rejected') then
    update public.talents set onboarding_status = 'in_progress', public_visible = false, updated_at = now() where id = p_talent_id;
    return jsonb_build_object('ok', true, 'alreadyEditable', true, 'status', submission_status);
  end if;
  if submission_status <> 'submitted' then raise exception 'Status profil tidak dapat ditarik untuk diedit'; end if;

  update public.talent_profile_submissions
  set status = 'draft', rejection_note = null, reviewed_at = null, updated_at = now()
  where talent_id = p_talent_id and status = 'submitted';
  if not found then raise exception 'Profil berubah saat ditarik. Muat ulang dan coba lagi.'; end if;

  update public.talents set onboarding_status = 'in_progress', public_visible = false, updated_at = now() where id = p_talent_id;
  return jsonb_build_object('ok', true, 'alreadyEditable', false, 'status', 'draft');
end;
$$;

create or replace function public.ns_reject_supply_profile_v1(p_talent_id uuid, p_rejection_note text default 'Perlu revisi')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  note text := coalesce(nullif(btrim(p_rejection_note), ''), 'Perlu revisi');
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then raise exception 'Profil supply tidak ditemukan'; end if;

  perform 1 from public.talent_profile_submissions where talent_id = p_talent_id and status = 'submitted' for update;
  if not found then raise exception 'Profil belum dikirim untuk ditinjau'; end if;

  update public.talent_profile_submissions
  set status = 'rejected', rejection_note = note, reviewed_at = now(), updated_at = now()
  where talent_id = p_talent_id and status = 'submitted';
  if not found then raise exception 'Profil berubah saat dikembalikan. Muat ulang dan coba lagi.'; end if;

  update public.talents set onboarding_status = 'rejected', public_visible = false, updated_at = now() where id = p_talent_id;
  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

create or replace function public.ns_approve_supply_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  s public.talent_profile_submissions%rowtype;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then raise exception 'Profil supply tidak ditemukan'; end if;

  select * into s from public.talent_profile_submissions where talent_id = p_talent_id for update;
  if not found or s.status <> 'submitted' then raise exception 'Profil belum dikirim untuk ditinjau'; end if;

  if nullif(btrim(s.name), '') is null then raise exception 'Nama profil wajib diisi'; end if;
  if nullif(btrim(s.category), '') is null then raise exception 'Kategori wajib diisi'; end if;
  if nullif(btrim(coalesce(s.base_city,'')), '') is null then raise exception 'Kota basis wajib diisi'; end if;
  if nullif(btrim(coalesce(s.bio,'')), '') is null then raise exception 'Profil singkat wajib diisi'; end if;
  if nullif(btrim(coalesce(s.manager_name,'')), '') is null then raise exception 'PIC utama wajib diisi'; end if;
  if nullif(btrim(coalesce(s.manager_email,'')), '') is null and nullif(btrim(coalesce(s.manager_whatsapp,'')), '') is null then raise exception 'Kontak PIC wajib diisi'; end if;
  if nullif(btrim(coalesce(s.portfolio_url,'')), '') is null then raise exception 'Link portofolio utama wajib diisi'; end if;
  if cardinality(coalesce(s.capability_tags,'{}')) = 0 and cardinality(coalesce(s.performance_formats,'{}')) = 0 then raise exception 'Minimal satu layanan atau kapabilitas wajib diisi'; end if;

  update public.talents set
    name = s.name,
    category = s.category,
    base_city = s.base_city,
    service_cities = coalesce(s.service_cities,'{}'),
    performance_formats = coalesce(s.performance_formats,'{}'),
    capability_tags = coalesce(s.capability_tags,'{}'),
    event_types = coalesce(s.event_types,'{}'),
    genres = '{}',
    music_styles = '{}',
    vibe_tags = '{}',
    act_type = null,
    willing_to_perform_covers = null,
    accepts_song_requests = null,
    sample_repertoire = '[]'::jsonb,
    repertoire_genres = '{}',
    repertoire_styles = '{}',
    repertoire_eras = '{}',
    repertoire_ai_status = 'not_applicable',
    repertoire_ai_updated_at = null,
    bio = s.bio,
    manager_name = s.manager_name,
    manager_email = s.manager_email,
    manager_whatsapp = s.manager_whatsapp,
    portfolio_url = s.portfolio_url,
    booking_limitations = s.booking_limitations,
    onboarding_status = 'approved',
    onboarding_approved_at = now(),
    status = 'verified',
    public_visible = false,
    updated_at = now()
  where id = p_talent_id;

  update public.talent_profile_submissions
  set status = 'approved', rejection_note = null, reviewed_at = now(), updated_at = now()
  where talent_id = p_talent_id and status = 'submitted';
  if not found then raise exception 'Profil berubah saat disetujui. Muat ulang dan coba lagi.'; end if;

  return jsonb_build_object('ok', true, 'status', 'approved', 'publicVisible', false, 'supplyType', t.supply_type);
end;
$$;

revoke all on function public.ns_submit_supply_profile_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_reopen_supply_profile_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_reject_supply_profile_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.ns_approve_supply_profile_v1(uuid) from public, anon, authenticated;

grant execute on function public.ns_submit_supply_profile_v1(uuid) to service_role;
grant execute on function public.ns_reopen_supply_profile_v1(uuid) to service_role;
grant execute on function public.ns_reject_supply_profile_v1(uuid,text) to service_role;
grant execute on function public.ns_approve_supply_profile_v1(uuid) to service_role;

comment on function public.ns_approve_supply_profile_v1(uuid) is 'Approve non-talent supply for internal verified database while keeping public_visible=false until a dedicated public channel is explicitly enabled.';
