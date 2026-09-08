-- Nusantara Star — Supply Category Adaptive Details V1
-- Additive JSONB detail storage for Professional and Production Partner category-specific onboarding.
-- Existing Talent onboarding remains unchanged.

alter table public.talents
  add column if not exists supply_details jsonb not null default '{}'::jsonb;

alter table public.talent_profile_submissions
  add column if not exists supply_details jsonb not null default '{}'::jsonb;

alter table public.talents
  drop constraint if exists talents_supply_details_object_check;
alter table public.talents
  add constraint talents_supply_details_object_check
  check (jsonb_typeof(supply_details) = 'object') not valid;
alter table public.talents validate constraint talents_supply_details_object_check;

alter table public.talent_profile_submissions
  drop constraint if exists talent_profile_submissions_supply_details_object_check;
alter table public.talent_profile_submissions
  add constraint talent_profile_submissions_supply_details_object_check
  check (jsonb_typeof(supply_details) = 'object') not valid;
alter table public.talent_profile_submissions validate constraint talent_profile_submissions_supply_details_object_check;

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
  if coalesce(s.supply_details, '{}'::jsonb) = '{}'::jsonb then raise exception 'Detail kategori wajib dilengkapi'; end if;

  update public.talents set
    name = s.name,
    category = s.category,
    base_city = s.base_city,
    service_cities = coalesce(s.service_cities,'{}'),
    performance_formats = coalesce(s.performance_formats,'{}'),
    capability_tags = coalesce(s.capability_tags,'{}'),
    event_types = coalesce(s.event_types,'{}'),
    supply_details = coalesce(s.supply_details,'{}'::jsonb),
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

revoke all on function public.ns_approve_supply_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_approve_supply_profile_v1(uuid) to service_role;

comment on column public.talents.supply_details is 'Admin-approved category-specific Professional or Production Partner details. Talent rows keep an empty object.';
comment on column public.talent_profile_submissions.supply_details is 'Draft/submitted category-specific Professional or Production Partner onboarding details.';
