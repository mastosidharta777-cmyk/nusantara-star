-- Rider normalization provenance and safe admin reprocessing.
-- Applied to Supabase project by migrations:
-- 20260911152210 add_admin_verified_rider_normalization_source
-- 20260911152633 add_rider_reprocess_and_correct_maliq_verified_v2

alter table public.talent_rider_versions
  drop constraint if exists talent_rider_versions_normalization_source_check;

alter table public.talent_rider_versions
  add constraint talent_rider_versions_normalization_source_check
  check (normalization_source in ('ai', 'rules', 'admin_verified'));

create or replace function public.ns_replace_current_rider_normalization_v1(
  p_talent_id uuid,
  p_normalized_data jsonb,
  p_missing_questions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current public.talent_rider_versions%rowtype;
  v_new_id uuid;
  v_status text;
begin
  if jsonb_typeof(p_normalized_data) <> 'object' then
    raise exception 'Normalized rider must be a JSON object';
  end if;
  if jsonb_typeof(p_missing_questions) <> 'array' then
    raise exception 'Missing questions must be a JSON array';
  end if;

  select * into v_current
  from public.talent_rider_versions
  where talent_id = p_talent_id and is_current = true
  for update;

  if not found then raise exception 'Current rider not found'; end if;
  if v_current.status = 'admin_approved' then raise exception 'Approved rider cannot be reprocessed'; end if;

  v_status := case
    when jsonb_array_length(p_missing_questions) > 0 then 'needs_talent_input'
    else 'ready_for_admin'
  end;

  update public.talent_rider_versions
  set is_current = false, status = 'superseded', updated_at = now()
  where id = v_current.id;

  insert into public.talent_rider_versions (
    talent_id, version_no, source_type, source_asset_id, source_hash, source_filename,
    source_text, extraction_status, normalized_data, missing_questions, answers,
    normalization_source, status, is_current, created_at, updated_at
  ) values (
    v_current.talent_id, v_current.version_no + 1, v_current.source_type,
    v_current.source_asset_id,
    md5(v_current.source_hash || ':renormalized:' || clock_timestamp()::text || random()::text),
    v_current.source_filename, v_current.source_text, 'ready',
    p_normalized_data, p_missing_questions, '{}'::jsonb,
    'ai', v_status, true, now(), now()
  ) returning id into v_new_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'version_no', v_current.version_no + 1,
    'status', v_status
  );
end;
$$;

revoke all on function public.ns_replace_current_rider_normalization_v1(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ns_replace_current_rider_normalization_v1(uuid, jsonb, jsonb) to service_role;
