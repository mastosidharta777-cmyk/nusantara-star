-- Nusantara Star — Human Flow + Music Onboarding V1
-- Additive migration. Run as a NEW query after the existing onboarding/taxonomy migrations.
-- SAFE CUTOVER: legacy act_type 'cover_entertainment' is intentionally retained so current Production remains compatible until the new app release is merged.

begin;

alter table public.talents
  add column if not exists willing_to_perform_covers boolean null,
  add column if not exists accepts_song_requests boolean null,
  add column if not exists sample_repertoire jsonb not null default '[]'::jsonb,
  add column if not exists repertoire_genres text[] not null default '{}',
  add column if not exists repertoire_styles text[] not null default '{}',
  add column if not exists repertoire_eras text[] not null default '{}',
  add column if not exists repertoire_ai_status text not null default 'not_applicable',
  add column if not exists repertoire_ai_updated_at timestamptz null;

alter table public.talent_profile_submissions
  add column if not exists willing_to_perform_covers boolean null,
  add column if not exists accepts_song_requests boolean null,
  add column if not exists sample_repertoire jsonb not null default '[]'::jsonb,
  add column if not exists repertoire_genres text[] not null default '{}',
  add column if not exists repertoire_styles text[] not null default '{}',
  add column if not exists repertoire_eras text[] not null default '{}',
  add column if not exists repertoire_ai_status text not null default 'not_applicable',
  add column if not exists repertoire_ai_updated_at timestamptz null;

-- Keep legacy value during cutover. New application code normalizes cover_entertainment -> cover_performer when reading old records.
alter table public.talents drop constraint if exists talents_act_type_check;
alter table public.talents add constraint talents_act_type_check
  check (act_type is null or act_type in ('original_artist','cover_entertainment','cover_performer','mixed'));

alter table public.talent_profile_submissions drop constraint if exists talent_profile_submissions_act_type_check;
alter table public.talent_profile_submissions add constraint talent_profile_submissions_act_type_check
  check (act_type is null or act_type in ('original_artist','cover_entertainment','cover_performer','mixed'));

alter table public.talents drop constraint if exists talents_sample_repertoire_check;
alter table public.talents add constraint talents_sample_repertoire_check
  check (jsonb_typeof(sample_repertoire) = 'array' and jsonb_array_length(sample_repertoire) <= 20);

alter table public.talent_profile_submissions drop constraint if exists talent_profile_submissions_sample_repertoire_check;
alter table public.talent_profile_submissions add constraint talent_profile_submissions_sample_repertoire_check
  check (jsonb_typeof(sample_repertoire) = 'array' and jsonb_array_length(sample_repertoire) <= 20);

alter table public.talents drop constraint if exists talents_repertoire_ai_status_check;
alter table public.talents add constraint talents_repertoire_ai_status_check
  check (repertoire_ai_status in ('not_applicable','pending','suggested','approved'));

alter table public.talent_profile_submissions drop constraint if exists talent_profile_submissions_repertoire_ai_status_check;
alter table public.talent_profile_submissions add constraint talent_profile_submissions_repertoire_ai_status_check
  check (repertoire_ai_status in ('not_applicable','pending','suggested','approved'));

comment on column public.talents.sample_repertoire is 'Approved sample repertoire. Each JSON item contains only title and artist; maximum 20 songs.';
comment on column public.talent_profile_submissions.sample_repertoire is 'Talent/manager supplied sample repertoire. Each item contains only title and artist; 10–20 required when the song act offers covers.';
comment on column public.talents.repertoire_genres is 'Admin-approved AI grouping derived from sample repertoire title+artist pairs.';
comment on column public.talents.repertoire_styles is 'Admin-approved AI style grouping derived from sample repertoire title+artist pairs.';
comment on column public.talents.repertoire_eras is 'Admin-approved AI era grouping derived from sample repertoire title+artist pairs.';
comment on column public.talents.accepts_song_requests is 'Whether a cover-capable song act accepts client song requests. Structured fact; do not infer from capability tags.';

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
  normalized_category text;
  is_song_act boolean := false;
  can_cover boolean := false;
  repertoire_count integer := 0;
begin
  perform 1 from public.talents where id = p_talent_id for update;
  if not found then raise exception 'Talent tidak ditemukan'; end if;

  select * into s
  from public.talent_profile_submissions
  where talent_id = p_talent_id
  for update;

  if not found or s.status <> 'submitted' then
    raise exception 'Profil belum dikirim untuk ditinjau';
  end if;

  normalized_category := lower(regexp_replace(coalesce(s.category,''), '[_-]+', ' ', 'g'));
  is_song_act := normalized_category in ('solo','singer','soloist','vocalist','duo','trio','duo/trio','duo trio','band');

  if is_song_act then
    if s.act_type not in ('original_artist','cover_performer','mixed') then
      raise exception 'Jenis musisi belum lengkap';
    end if;

    if s.act_type = 'original_artist' and s.willing_to_perform_covers is null then
      raise exception 'Kesediaan membawakan lagu cover belum dijawab';
    end if;

    can_cover := s.act_type in ('cover_performer','mixed')
      or (s.act_type = 'original_artist' and s.willing_to_perform_covers = true);

    if can_cover then
      if s.accepts_song_requests is null then
        raise exception 'Pilihan menerima permintaan lagu dari klien belum dijawab';
      end if;

      repertoire_count := jsonb_array_length(coalesce(s.sample_repertoire,'[]'::jsonb));
      if repertoire_count < 10 or repertoire_count > 20 then
        raise exception 'Contoh daftar lagu harus berisi 10–20 lagu';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(s.sample_repertoire) item
        where nullif(btrim(item->>'title'),'') is null
           or nullif(btrim(item->>'artist'),'') is null
      ) then
        raise exception 'Setiap lagu wajib memiliki Judul Lagu dan Artis';
      end if;

      if s.repertoire_ai_status not in ('suggested','approved') then
        raise exception 'Pengelompokan daftar lagu oleh AI belum siap diperiksa. Jalankan analisis ulang terlebih dahulu.';
      end if;
    end if;
  end if;

  select exists(
    select 1 from public.talent_assets
    where talent_id=p_talent_id
      and asset_type='profile_photo'
      and upload_status='uploaded'
      and review_status='approved'
      and buyer_visible=true
  ) into has_photo;

  select exists(
    select 1 from public.talent_assets
    where talent_id=p_talent_id
      and asset_type in ('live_performance','showreel','event_clip')
      and upload_status='uploaded'
      and review_status='approved'
      and buyer_visible=true
  ) into has_video;

  if not has_photo or not has_video then
    raise exception 'Setujui minimal 1 foto profil dan 1 video terlebih dahulu';
  end if;

  select true,status into has_rider,rider_status
  from public.talent_rider_versions
  where talent_id=p_talent_id and is_current=true
  for update;

  if has_rider and rider_status <> 'admin_approved' then
    raise exception 'Setujui rider utama terlebih dahulu sebelum profil dipublikasikan';
  end if;

  update public.talents set
    name=s.name,
    category=s.category,
    act_type=s.act_type,
    willing_to_perform_covers=case when is_song_act then s.willing_to_perform_covers else null end,
    accepts_song_requests=case when can_cover then s.accepts_song_requests else null end,
    sample_repertoire=case when can_cover then s.sample_repertoire else '[]'::jsonb end,
    repertoire_genres=case when can_cover then coalesce(s.repertoire_genres,'{}') else '{}' end,
    repertoire_styles=case when can_cover then coalesce(s.repertoire_styles,'{}') else '{}' end,
    repertoire_eras=case when can_cover then coalesce(s.repertoire_eras,'{}') else '{}' end,
    repertoire_ai_status=case when can_cover then 'approved' else 'not_applicable' end,
    repertoire_ai_updated_at=case when can_cover then s.repertoire_ai_updated_at else null end,
    base_city=s.base_city,
    genres=array(
      select distinct x
      from unnest(coalesce(s.genres,'{}') || case when can_cover then coalesce(s.repertoire_genres,'{}') else '{}' end) x
      where nullif(btrim(x),'') is not null
    ),
    music_styles=array(
      select distinct x
      from unnest(coalesce(s.music_styles,'{}') || case when can_cover then coalesce(s.repertoire_styles,'{}') || coalesce(s.repertoire_eras,'{}') else '{}' end) x
      where nullif(btrim(x),'') is not null
    ),
    vibe_tags=coalesce(s.vibe_tags,'{}'),
    capability_tags=array(
      select x
      from unnest(coalesce(s.capability_tags,'{}')) x
      where lower(btrim(x)) <> 'request song'
    ),
    service_cities=s.service_cities,
    performance_formats=s.performance_formats,
    event_types=s.event_types,
    bio=s.bio,
    show_duration_minutes=s.show_duration_minutes,
    manager_name=s.manager_name,
    manager_email=s.manager_email,
    manager_whatsapp=s.manager_whatsapp,
    instagram_url=s.instagram_url,
    tiktok_url=s.tiktok_url,
    youtube_url=s.youtube_url,
    base_rider=s.base_rider,
    travel_policy=s.travel_policy,
    accommodation_policy=s.accommodation_policy,
    onboarding_status='approved',
    onboarding_approved_at=now(),
    status='verified',
    public_visible=true,
    updated_at=now()
  where id=p_talent_id;

  update public.talent_profile_submissions
  set status='approved',
      repertoire_ai_status=case when can_cover then 'approved' else 'not_applicable' end,
      rejection_note=null,
      reviewed_at=now(),
      updated_at=now()
  where talent_id=p_talent_id and status='submitted';

  if not found then
    raise exception 'Profil berubah saat disetujui. Muat ulang dan coba lagi.';
  end if;

  return jsonb_build_object('ok',true,'status','approved');
end;
$$;

revoke all on function public.ns_approve_talent_profile_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_approve_talent_profile_v1(uuid) to service_role;

create or replace function public.ns_human_flow_music_onboarding_ready_v1()
returns boolean
language sql
security definer
set search_path=public
as $$ select true; $$;

revoke all on function public.ns_human_flow_music_onboarding_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_human_flow_music_onboarding_ready_v1() to service_role;

commit;

select public.ns_human_flow_music_onboarding_ready_v1() as human_flow_music_onboarding_ready;
