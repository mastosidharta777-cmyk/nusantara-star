-- Nusantara Star — Talent Self Revision V1
-- Lets a talent/manager withdraw a submitted profile before approval,
-- then edit the draft and submit it again for a fresh admin review.

begin;

create or replace function public.ns_reopen_talent_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_status text;
begin
  perform 1
  from public.talents
  where id = p_talent_id
  for update;

  if not found then
    raise exception 'Talent tidak ditemukan';
  end if;

  select status into submission_status
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'Profil onboarding tidak ditemukan';
  end if;
  if submission_status = 'approved' then
    raise exception 'Profil sudah disetujui dan tidak dapat ditarik dari portal onboarding';
  end if;
  if submission_status in ('draft', 'rejected') then
    update public.talents
    set onboarding_status = 'in_progress',
        public_visible = false,
        updated_at = now()
    where id = p_talent_id;
    return jsonb_build_object('ok', true, 'alreadyEditable', true, 'status', submission_status);
  end if;
  if submission_status <> 'submitted' then
    raise exception 'Status profil tidak dapat ditarik untuk diedit';
  end if;

  update public.talent_profile_submissions
  set status = 'draft',
      rejection_note = null,
      reviewed_at = null,
      updated_at = now()
  where talent_id = p_talent_id
    and status = 'submitted';

  if not found then
    raise exception 'Profil berubah saat ditarik. Muat ulang dan coba lagi.';
  end if;

  update public.talents
  set onboarding_status = 'in_progress',
      public_visible = false,
      updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'alreadyEditable', false, 'status', 'draft');
end;
$$;

revoke all on function public.ns_reopen_talent_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_reopen_talent_profile_v1(uuid) to service_role;

create or replace function public.ns_submit_talent_profile_v1(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_status text;
begin
  perform 1
  from public.talents
  where id = p_talent_id
  for update;

  if not found then
    raise exception 'Talent tidak ditemukan';
  end if;

  select status into submission_status
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'Profil onboarding tidak ditemukan';
  end if;
  if submission_status = 'approved' then
    raise exception 'Profil sudah disetujui dan tidak dapat dikirim ulang dari portal onboarding';
  end if;
  if submission_status = 'submitted' then
    return jsonb_build_object('ok', true, 'alreadySubmitted', true, 'status', 'submitted');
  end if;
  if submission_status not in ('draft', 'rejected') then
    raise exception 'Status profil tidak dapat dikirim untuk ditinjau';
  end if;

  update public.talent_profile_submissions
  set status = 'submitted',
      submitted_at = now(),
      rejection_note = null,
      reviewed_at = null,
      updated_at = now()
  where talent_id = p_talent_id
    and status in ('draft', 'rejected');

  if not found then
    raise exception 'Profil berubah saat dikirim. Muat ulang dan coba lagi.';
  end if;

  update public.talents
  set onboarding_status = 'submitted',
      public_visible = false,
      updated_at = now()
  where id = p_talent_id;

  return jsonb_build_object('ok', true, 'alreadySubmitted', false, 'status', 'submitted');
end;
$$;

revoke all on function public.ns_submit_talent_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_submit_talent_profile_v1(uuid) to service_role;

create or replace function public.ns_talent_self_revision_ready_v1()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    to_regprocedure('public.ns_reopen_talent_profile_v1(uuid)') is not null
    and to_regprocedure('public.ns_submit_talent_profile_v1(uuid)') is not null
    and not has_function_privilege('anon', 'public.ns_reopen_talent_profile_v1(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.ns_reopen_talent_profile_v1(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.ns_submit_talent_profile_v1(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.ns_submit_talent_profile_v1(uuid)', 'execute');
$$;

revoke all on function public.ns_talent_self_revision_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_talent_self_revision_ready_v1() to service_role;

commit;

select public.ns_talent_self_revision_ready_v1() as talent_self_revision_ready;
