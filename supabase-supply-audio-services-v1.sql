-- Nusantara Star — Studio audio and songwriting service taxonomy V1
-- Run after supabase-supply-services-multivalue-v1.sql.
-- Additive: no existing profile is altered. It only expands the allowed service IDs.

alter table public.talents
  drop constraint if exists talents_supply_services_check;

alter table public.talents
  add constraint talents_supply_services_check check (
    supply_type = 'talent' or (
      (cardinality(supply_service_ids) = 0 and primary_supply_service_id is null and supply_other_service is null)
      or (
        cardinality(supply_service_ids) > 0
        and supply_service_ids <@ array[
          'music_director','music_producer_arranger','songwriter_topliner','session_musician',
          'recording_engineer','mixing_engineer','mastering_engineer','foh_monitor_engineer',
          'stage_manager','production_manager','show_director','photographer','videographer_editor',
          'choreographer','lighting_designer','sound_system','lighting','stage_rigging','led_multimedia',
          'backline','event_production','technical_crew','equipment_rental','power_genset',
          'transport_logistics','event_equipment','other'
        ]
        and primary_supply_service_id = any(supply_service_ids)
        and ((array_position(supply_service_ids, 'other') is not null and nullif(btrim(supply_other_service), '') is not null) or (array_position(supply_service_ids, 'other') is null and supply_other_service is null))
      )
    )
  ) not valid;

alter table public.talents validate constraint talents_supply_services_check;

alter table public.talent_profile_submissions
  drop constraint if exists talent_profile_submissions_supply_services_check;

alter table public.talent_profile_submissions
  add constraint talent_profile_submissions_supply_services_check check (
    cardinality(supply_service_ids) = 0
    or (
      supply_service_ids <@ array[
        'music_director','music_producer_arranger','songwriter_topliner','session_musician',
        'recording_engineer','mixing_engineer','mastering_engineer','foh_monitor_engineer',
        'stage_manager','production_manager','show_director','photographer','videographer_editor',
        'choreographer','lighting_designer','sound_system','lighting','stage_rigging','led_multimedia',
        'backline','event_production','technical_crew','equipment_rental','power_genset',
        'transport_logistics','event_equipment','other'
      ]
      and primary_supply_service_id = any(supply_service_ids)
      and ((array_position(supply_service_ids, 'other') is not null and nullif(btrim(supply_other_service), '') is not null) or (array_position(supply_service_ids, 'other') is null and supply_other_service is null))
    )
  ) not valid;

alter table public.talent_profile_submissions validate constraint talent_profile_submissions_supply_services_check;

comment on table public.talents is
  'Supply profiles. Studio services are distinct from FOH/Monitor live sound; songwriter/topliner has separate commercial and copyright terms per Work Order.';
