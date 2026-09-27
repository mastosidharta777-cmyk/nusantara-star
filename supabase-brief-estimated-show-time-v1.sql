-- Nusantara Star — optional buyer-provided estimated show time.
-- Apply before deploying the brief form and availability response changes.
-- These estimates are not a confirmed schedule or a booking reservation.

begin;

alter table public.briefs
  add column if not exists estimated_show_start_local time without time zone null,
  add column if not exists estimated_show_end_local time without time zone null,
  add column if not exists estimated_show_timezone text null;

alter table public.briefs drop constraint if exists briefs_estimated_show_time_complete_v1;
alter table public.briefs add constraint briefs_estimated_show_time_complete_v1 check (
  (estimated_show_start_local is null and estimated_show_end_local is null and estimated_show_timezone is null)
  or (estimated_show_start_local is not null and estimated_show_end_local is not null
      and estimated_show_start_local <> estimated_show_end_local
      and estimated_show_timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'))
);

comment on column public.briefs.estimated_show_start_local is 'Buyer estimate only; confirmation of the full talent commitment window happens separately.';
comment on column public.briefs.estimated_show_end_local is 'Buyer estimate only. A time earlier than the start denotes an end after midnight.';
comment on column public.briefs.estimated_show_timezone is 'IANA time zone for the buyer-provided local show times (WIB, WITA, or WIT).';

commit;
