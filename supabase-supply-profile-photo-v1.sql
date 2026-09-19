-- Nusantara Star — Supply Profile Photo / Logo V1
-- Reuses talent_assets and the private talent-photos bucket for Professional and Production Partner identity media.

create or replace function public.ns_require_supply_photo_on_submit_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supply_type text;
begin
  if new.status <> 'submitted' or old.status = 'submitted' then return new; end if;
  select supply_type into v_supply_type from public.talents where id = new.talent_id;
  if v_supply_type not in ('professional', 'production_partner') then return new; end if;
  if not exists (
    select 1 from public.talent_assets
    where talent_id = new.talent_id and asset_type = 'profile_photo' and upload_status = 'uploaded'
  ) then
    raise exception 'Foto profesional atau logo wajib diunggah sebelum profil dikirim';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_supply_photo_on_submit_v1 on public.talent_profile_submissions;
create trigger trg_require_supply_photo_on_submit_v1
before update of status on public.talent_profile_submissions
for each row execute function public.ns_require_supply_photo_on_submit_v1();

create or replace function public.ns_require_supply_photo_on_approval_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.supply_type not in ('professional', 'production_partner')
    or new.onboarding_status <> 'approved' or old.onboarding_status = 'approved' then return new; end if;
  if not exists (
    select 1 from public.talent_assets
    where talent_id = new.id and asset_type = 'profile_photo'
      and upload_status = 'uploaded' and review_status = 'approved'
  ) then
    raise exception 'Foto profesional atau logo harus disetujui sebelum profil supply disetujui';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_supply_photo_on_approval_v1 on public.talents;
create trigger trg_require_supply_photo_on_approval_v1
before update of onboarding_status on public.talents
for each row execute function public.ns_require_supply_photo_on_approval_v1();

comment on function public.ns_require_supply_photo_on_submit_v1() is
  'Requires an uploaded professional photo or company logo for Professional and Production Partner onboarding.';
