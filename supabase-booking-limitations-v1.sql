-- Nusantara Star — Booking Limitations V1
-- Additive migration. Run as a NEW query before testing this application release.
-- Legacy event_types and show_duration_minutes columns are retained for backward compatibility,
-- but talent onboarding no longer asks talent/manager to fill them.

begin;

alter table public.talents
  add column if not exists booking_limitations text null;

alter table public.talent_profile_submissions
  add column if not exists booking_limitations text null;

alter table public.talents
  drop constraint if exists talents_booking_limitations_check;
alter table public.talents
  add constraint talents_booking_limitations_check
  check (booking_limitations is null or char_length(booking_limitations) <= 2000);

alter table public.talent_profile_submissions
  drop constraint if exists talent_profile_submissions_booking_limitations_check;
alter table public.talent_profile_submissions
  add constraint talent_profile_submissions_booking_limitations_check
  check (booking_limitations is null or char_length(booking_limitations) <= 2000);

comment on column public.talents.booking_limitations is
  'Admin-reviewed booking restrictions. Empty means the talent did not state a restriction; every offer still requires live confirmation.';

comment on column public.talent_profile_submissions.booking_limitations is
  'Optional restrictions stated by talent/manager. Compare manually with the buyer brief before sending an offer.';

create or replace function public.ns_sync_booking_limitations_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.talents
    set booking_limitations = nullif(btrim(new.booking_limitations), ''),
        updated_at = now()
    where id = new.talent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ns_sync_booking_limitations_v1 on public.talent_profile_submissions;
create trigger ns_sync_booking_limitations_v1
after insert or update of status, booking_limitations
on public.talent_profile_submissions
for each row
execute function public.ns_sync_booking_limitations_v1();

update public.talents t
set booking_limitations = nullif(btrim(s.booking_limitations), ''),
    updated_at = now()
from public.talent_profile_submissions s
where s.talent_id = t.id
  and s.status = 'approved'
  and t.booking_limitations is distinct from nullif(btrim(s.booking_limitations), '');

create or replace function public.ns_booking_limitations_ready_v1()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'talents'
        and column_name = 'booking_limitations'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'talent_profile_submissions'
        and column_name = 'booking_limitations'
    )
    and exists (
      select 1 from pg_trigger
      where tgrelid = 'public.talent_profile_submissions'::regclass
        and tgname = 'ns_sync_booking_limitations_v1'
        and not tgisinternal
    );
$$;

revoke all on function public.ns_sync_booking_limitations_v1() from public, anon, authenticated;
revoke all on function public.ns_booking_limitations_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_booking_limitations_ready_v1() to service_role;

commit;

select public.ns_booking_limitations_ready_v1() as booking_limitations_ready;
