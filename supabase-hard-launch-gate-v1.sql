-- Nusantara Star — separate internal approval from public publication.
-- A talent can be operationally approved without becoming publicly discoverable.

create or replace function public.ns_keep_talent_approval_private_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.supply_type = 'talent'
     and new.onboarding_status = 'approved'
     and old.onboarding_status is distinct from 'approved' then
    new.public_visible := false;
  end if;
  return new;
end;
$$;

drop trigger if exists ns_keep_talent_approval_private_v1 on public.talents;
create trigger ns_keep_talent_approval_private_v1
before update of onboarding_status on public.talents
for each row execute function public.ns_keep_talent_approval_private_v1();

create or replace function public.ns_set_talent_public_visibility_v1(
  p_talent_id uuid,
  p_public_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.talents%rowtype;
  has_photo boolean := false;
  has_media boolean := false;
begin
  select * into t from public.talents where id = p_talent_id for update;
  if not found or t.supply_type <> 'talent' then
    raise exception 'Talent tidak ditemukan';
  end if;

  if p_public_visible then
    if t.status <> 'verified' or t.onboarding_status <> 'approved' then
      raise exception 'Profil harus terverifikasi dan disetujui sebelum disiapkan untuk publik';
    end if;

    select exists(
      select 1 from public.talent_assets
      where talent_id = p_talent_id
        and asset_type = 'profile_photo'
        and upload_status = 'uploaded'
        and review_status = 'approved'
        and buyer_visible = true
    ) into has_photo;

    select exists(
      select 1 from public.talent_assets
      where talent_id = p_talent_id
        and asset_type in ('live_performance', 'showreel', 'event_clip')
        and upload_status = 'uploaded'
        and review_status = 'approved'
        and buyer_visible = true
    ) into has_media;

    if not has_photo or not has_media then
      raise exception 'Setujui minimal satu foto profil dan satu media penampilan sebelum menyiapkan profil untuk publik';
    end if;
  end if;

  update public.talents
  set public_visible = p_public_visible,
      updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'public_visible', p_public_visible);
end;
$$;

revoke all on function public.ns_set_talent_public_visibility_v1(uuid, boolean) from public, anon, authenticated;
grant execute on function public.ns_set_talent_public_visibility_v1(uuid, boolean) to service_role;
