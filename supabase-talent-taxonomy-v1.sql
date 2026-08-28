-- Nusantara Star — Talent Taxonomy V1
-- Adds taxonomy used by onboarding and hybrid AI/rules matching.

alter table public.talents
  add column if not exists act_type text,
  add column if not exists music_styles text[] not null default '{}',
  add column if not exists vibe_tags text[] not null default '{}',
  add column if not exists capability_tags text[] not null default '{}';

alter table public.talent_profile_submissions
  add column if not exists act_type text,
  add column if not exists music_styles text[] not null default '{}',
  add column if not exists vibe_tags text[] not null default '{}',
  add column if not exists capability_tags text[] not null default '{}';

alter table public.talents drop constraint if exists talents_act_type_check;
alter table public.talents add constraint talents_act_type_check
  check (act_type is null or act_type in ('original_artist','cover_entertainment'));

alter table public.talent_profile_submissions drop constraint if exists talent_profile_submissions_act_type_check;
alter table public.talent_profile_submissions add constraint talent_profile_submissions_act_type_check
  check (act_type is null or act_type in ('original_artist','cover_entertainment'));

comment on column public.talents.act_type is 'Primary entertainment identity: original artist or cover/entertainment act.';
comment on column public.talents.music_styles is 'Buyer-facing/matching styles such as Top 40, Rock, Pop, 90s.';
comment on column public.talents.vibe_tags is 'Energy/vibe tags such as Chill, Elegant, Party, High Energy.';
comment on column public.talents.capability_tags is 'Performance capabilities such as Request Song, Singalong, Danceable.';
