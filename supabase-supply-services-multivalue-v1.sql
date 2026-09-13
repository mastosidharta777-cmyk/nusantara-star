-- Nusantara Star — Multi-service Professional & Production Partner onboarding V1
-- Additive migration: keeps legacy category text intact while normalizing it into structured services.

alter table public.talents
  add column if not exists supply_service_ids text[] not null default '{}',
  add column if not exists primary_supply_service_id text,
  add column if not exists supply_other_service text;

alter table public.talent_profile_submissions
  add column if not exists supply_service_ids text[] not null default '{}',
  add column if not exists primary_supply_service_id text,
  add column if not exists supply_other_service text;

-- Legacy category becomes a single selected service. Unknown historical labels are preserved as Other.
with mapped as (
  select id,
    case lower(btrim(category))
      when 'music director' then 'music_director' when 'music producer / arranger' then 'music_producer_arranger'
      when 'session musician' then 'session_musician' when 'foh / monitor engineer' then 'foh_monitor_engineer'
      when 'stage manager' then 'stage_manager' when 'production manager' then 'production_manager'
      when 'show director' then 'show_director' when 'photographer' then 'photographer'
      when 'videographer / editor' then 'videographer_editor' when 'choreographer' then 'choreographer'
      when 'lighting designer' then 'lighting_designer' when 'sound system' then 'sound_system'
      when 'lighting' then 'lighting' when 'stage / rigging' then 'stage_rigging'
      when 'led / multimedia' then 'led_multimedia' when 'backline' then 'backline'
      when 'event production' then 'event_production' when 'technical crew' then 'technical_crew'
      when 'equipment rental' then 'equipment_rental' when 'power / genset' then 'power_genset'
      when 'transport / logistics' then 'transport_logistics' when 'event equipment' then 'event_equipment'
      else 'other'
    end as service_id,
    coalesce(nullif(btrim(category), ''), 'Unspecified legacy service') as legacy_category
  from public.talents
  where supply_type in ('professional', 'production_partner') and cardinality(supply_service_ids) = 0
)
update public.talents t
set supply_service_ids = array[m.service_id],
    primary_supply_service_id = m.service_id,
    supply_other_service = case when m.service_id = 'other' then m.legacy_category else null end
from mapped m where t.id = m.id;

with mapped as (
  select id,
    case lower(btrim(category))
      when 'music director' then 'music_director' when 'music producer / arranger' then 'music_producer_arranger'
      when 'session musician' then 'session_musician' when 'foh / monitor engineer' then 'foh_monitor_engineer'
      when 'stage manager' then 'stage_manager' when 'production manager' then 'production_manager'
      when 'show director' then 'show_director' when 'photographer' then 'photographer'
      when 'videographer / editor' then 'videographer_editor' when 'choreographer' then 'choreographer'
      when 'lighting designer' then 'lighting_designer' when 'sound system' then 'sound_system'
      when 'lighting' then 'lighting' when 'stage / rigging' then 'stage_rigging'
      when 'led / multimedia' then 'led_multimedia' when 'backline' then 'backline'
      when 'event production' then 'event_production' when 'technical crew' then 'technical_crew'
      when 'equipment rental' then 'equipment_rental' when 'power / genset' then 'power_genset'
      when 'transport / logistics' then 'transport_logistics' when 'event equipment' then 'event_equipment'
      else 'other'
    end as service_id,
    coalesce(nullif(btrim(category), ''), 'Unspecified legacy service') as legacy_category
  from public.talent_profile_submissions
  where exists (select 1 from public.talents t where t.id = talent_profile_submissions.talent_id and t.supply_type in ('professional', 'production_partner'))
    and cardinality(supply_service_ids) = 0
)
update public.talent_profile_submissions s
set supply_service_ids = array[m.service_id],
    primary_supply_service_id = m.service_id,
    supply_other_service = case when m.service_id = 'other' then m.legacy_category else null end
from mapped m where s.id = m.id;

alter table public.talents drop constraint if exists talents_supply_services_check;
alter table public.talents add constraint talents_supply_services_check check (
  supply_type = 'talent' or (
    (cardinality(supply_service_ids) = 0 and primary_supply_service_id is null and supply_other_service is null)
    or (
      cardinality(supply_service_ids) > 0
      and supply_service_ids <@ array['music_director','music_producer_arranger','session_musician','foh_monitor_engineer','stage_manager','production_manager','show_director','photographer','videographer_editor','choreographer','lighting_designer','sound_system','lighting','stage_rigging','led_multimedia','backline','event_production','technical_crew','equipment_rental','power_genset','transport_logistics','event_equipment','other']
      and primary_supply_service_id = any(supply_service_ids)
      and ((array_position(supply_service_ids, 'other') is not null and nullif(btrim(supply_other_service), '') is not null) or (array_position(supply_service_ids, 'other') is null and supply_other_service is null))
    )
  )
) not valid;
alter table public.talents validate constraint talents_supply_services_check;

alter table public.talent_profile_submissions drop constraint if exists talent_profile_submissions_supply_services_check;
alter table public.talent_profile_submissions add constraint talent_profile_submissions_supply_services_check check (
  cardinality(supply_service_ids) = 0
  or (
    supply_service_ids <@ array['music_director','music_producer_arranger','session_musician','foh_monitor_engineer','stage_manager','production_manager','show_director','photographer','videographer_editor','choreographer','lighting_designer','sound_system','lighting','stage_rigging','led_multimedia','backline','event_production','technical_crew','equipment_rental','power_genset','transport_logistics','event_equipment','other']
    and primary_supply_service_id = any(supply_service_ids)
    and ((array_position(supply_service_ids, 'other') is not null and nullif(btrim(supply_other_service), '') is not null) or (array_position(supply_service_ids, 'other') is null and supply_other_service is null))
  )
) not valid;
alter table public.talent_profile_submissions validate constraint talent_profile_submissions_supply_services_check;

create or replace function public.ns_submit_supply_profile_v1(p_talent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.talents%rowtype; s public.talent_profile_submissions%rowtype;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then raise exception 'Profil supply tidak ditemukan'; end if;
  select * into s from public.talent_profile_submissions where talent_id = p_talent_id for update;
  if not found then raise exception 'Profil onboarding tidak ditemukan'; end if;
  if s.status = 'approved' then raise exception 'Profil sudah disetujui dan tidak dapat dikirim ulang'; end if;
  if s.status = 'submitted' then return jsonb_build_object('ok', true, 'alreadySubmitted', true, 'status', 'submitted'); end if;
  if s.status not in ('draft','rejected') then raise exception 'Status profil tidak dapat dikirim untuk ditinjau'; end if;
  if cardinality(coalesce(s.supply_service_ids,'{}')) = 0 then raise exception 'Minimal satu layanan wajib dipilih'; end if;
  if s.primary_supply_service_id is null or not (s.primary_supply_service_id = any(s.supply_service_ids)) then raise exception 'Layanan Utama wajib dipilih'; end if;
  if array_position(s.supply_service_ids, 'other') is not null and nullif(btrim(s.supply_other_service), '') is null then raise exception 'Layanan lainnya wajib dijelaskan'; end if;
  update public.talent_profile_submissions set status = 'submitted', submitted_at = now(), rejection_note = null, reviewed_at = null, updated_at = now() where talent_id = p_talent_id and status in ('draft','rejected');
  if not found then raise exception 'Profil berubah saat dikirim. Muat ulang dan coba lagi.'; end if;
  update public.talents set onboarding_status = 'submitted', public_visible = false, updated_at = now() where id = p_talent_id;
  return jsonb_build_object('ok', true, 'alreadySubmitted', false, 'status', 'submitted');
end; $$;

create or replace function public.ns_approve_supply_profile_v1(p_talent_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.talents%rowtype; s public.talent_profile_submissions%rowtype;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type not in ('professional','production_partner') then raise exception 'Profil supply tidak ditemukan'; end if;
  select * into s from public.talent_profile_submissions where talent_id = p_talent_id for update;
  if not found or s.status <> 'submitted' then raise exception 'Profil belum dikirim untuk ditinjau'; end if;
  if nullif(btrim(s.name), '') is null then raise exception 'Nama profil wajib diisi'; end if;
  if nullif(btrim(coalesce(s.base_city,'')), '') is null then raise exception 'Kota basis wajib diisi'; end if;
  if nullif(btrim(coalesce(s.bio,'')), '') is null then raise exception 'Profil singkat wajib diisi'; end if;
  if nullif(btrim(coalesce(s.manager_name,'')), '') is null then raise exception 'PIC utama wajib diisi'; end if;
  if nullif(btrim(coalesce(s.manager_email,'')), '') is null and nullif(btrim(coalesce(s.manager_whatsapp,'')), '') is null then raise exception 'Kontak PIC wajib diisi'; end if;
  if nullif(btrim(coalesce(s.portfolio_url,'')), '') is null then raise exception 'Link portofolio utama wajib diisi'; end if;
  if cardinality(coalesce(s.supply_service_ids,'{}')) = 0 then raise exception 'Minimal satu layanan wajib dipilih'; end if;
  if s.primary_supply_service_id is null or not (s.primary_supply_service_id = any(s.supply_service_ids)) then raise exception 'Layanan Utama wajib dipilih'; end if;
  if array_position(s.supply_service_ids, 'other') is not null and nullif(btrim(s.supply_other_service), '') is null then raise exception 'Layanan lainnya wajib dijelaskan'; end if;
  if s.primary_supply_service_id <> 'other' and coalesce(s.supply_details, '{}'::jsonb) = '{}'::jsonb then raise exception 'Detail layanan utama wajib dilengkapi'; end if;
  update public.talents set
    name=s.name, category=s.category, supply_service_ids=coalesce(s.supply_service_ids,'{}'), primary_supply_service_id=s.primary_supply_service_id, supply_other_service=s.supply_other_service,
    base_city=s.base_city, service_cities=coalesce(s.service_cities,'{}'), performance_formats=coalesce(s.performance_formats,'{}'), capability_tags=coalesce(s.capability_tags,'{}'), event_types=coalesce(s.event_types,'{}'), supply_details=coalesce(s.supply_details,'{}'::jsonb),
    genres='{}', music_styles='{}', vibe_tags='{}', act_type=null, willing_to_perform_covers=null, accepts_song_requests=null, sample_repertoire='[]'::jsonb, repertoire_genres='{}', repertoire_styles='{}', repertoire_eras='{}', repertoire_ai_status='not_applicable', repertoire_ai_updated_at=null,
    bio=s.bio, manager_name=s.manager_name, manager_email=s.manager_email, manager_whatsapp=s.manager_whatsapp, portfolio_url=s.portfolio_url, booking_limitations=s.booking_limitations,
    onboarding_status='approved', onboarding_approved_at=now(), status='verified', public_visible=false, updated_at=now()
  where id=p_talent_id;
  update public.talent_profile_submissions set status='approved', rejection_note=null, reviewed_at=now(), updated_at=now() where talent_id=p_talent_id and status='submitted';
  if not found then raise exception 'Profil berubah saat disetujui. Muat ulang dan coba lagi.'; end if;
  return jsonb_build_object('ok',true,'status','approved','publicVisible',false,'supplyType',t.supply_type);
end; $$;

revoke all on function public.ns_submit_supply_profile_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_approve_supply_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_submit_supply_profile_v1(uuid) to service_role;
grant execute on function public.ns_approve_supply_profile_v1(uuid) to service_role;

comment on column public.talents.supply_service_ids is 'Structured service IDs for Professional and Production Partner profiles; Talent rows remain empty.';
comment on column public.talents.primary_supply_service_id is 'Exactly one selected primary service for non-Talent supply profiles.';
comment on column public.talents.supply_other_service is 'Registrant-provided label when the selected services include other.';
