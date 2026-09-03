-- Nusantara Star — Onboarding Revision Functions V1
-- Adds only the missing revision and rider-approval RPCs.
-- The existing profile-approval RPC is intentionally left unchanged.

begin;

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

  if not found then
    raise exception 'Belum ada rider utama untuk ditinjau';
  end if;
  if r.status = 'admin_approved' then
    return jsonb_build_object('ok', true, 'alreadyApproved', true, 'riderId', r.id);
  end if;
  if r.status = 'needs_talent_input'
     or jsonb_array_length(coalesce(r.missing_questions, '[]'::jsonb)) > 0 then
    raise exception 'Rider belum lengkap. Minta talent melengkapi pertanyaan yang masih terbuka.';
  end if;
  if r.status <> 'ready_for_admin' then
    raise exception 'Rider belum siap ditinjau admin';
  end if;

  update public.talent_rider_versions
  set status = 'admin_approved',
      admin_approved_at = now(),
      updated_at = now()
  where id = r.id and status = 'ready_for_admin';

  if not found then
    raise exception 'Rider berubah saat ditinjau. Muat ulang dan coba lagi.';
  end if;

  return jsonb_build_object('ok', true, 'alreadyApproved', false, 'riderId', r.id);
end;
$$;

create or replace function public.ns_reject_talent_profile_v1(
  p_talent_id uuid,
  p_rejection_note text default 'Perlu revisi'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.talent_profile_submissions%rowtype;
  note text := coalesce(nullif(btrim(p_rejection_note), ''), 'Perlu revisi');
begin
  perform 1
  from public.talents
  where id = p_talent_id
  for update;

  if not found then
    raise exception 'Talent tidak ditemukan';
  end if;

  select * into s
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'Profil onboarding tidak ditemukan';
  end if;
  if s.status <> 'submitted' then
    raise exception 'Profil belum dikirim untuk ditinjau';
  end if;

  update public.talent_profile_submissions
  set status = 'rejected',
      rejection_note = note,
      reviewed_at = now(),
      updated_at = now()
  where talent_id = p_talent_id and status = 'submitted';

  if not found then
    raise exception 'Profil berubah saat dikembalikan. Muat ulang dan coba lagi.';
  end if;

  update public.talents
  set onboarding_status = 'rejected',
      public_visible = false,
      updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

revoke all on function public.ns_approve_talent_rider_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_reject_talent_profile_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.ns_approve_talent_rider_v1(uuid) to service_role;
grant execute on function public.ns_reject_talent_profile_v1(uuid, text) to service_role;

create or replace function public.ns_onboarding_revision_ready_v1()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    to_regprocedure('public.ns_approve_talent_rider_v1(uuid)') is not null
    and to_regprocedure('public.ns_reject_talent_profile_v1(uuid,text)') is not null
    and not has_function_privilege('anon', 'public.ns_approve_talent_rider_v1(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.ns_approve_talent_rider_v1(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.ns_reject_talent_profile_v1(uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.ns_reject_talent_profile_v1(uuid,text)', 'execute');
$$;

revoke all on function public.ns_onboarding_revision_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_onboarding_revision_ready_v1() to service_role;

commit;

select public.ns_onboarding_revision_ready_v1() as onboarding_revision_ready;
