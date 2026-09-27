-- Nusantara Star — guard against securing the same talent twice on one event date.
-- Apply after supabase-commercial-integrity-hardening-v2.sql.
-- Pending security remains possible for competing briefs; only a secured or
-- later active booking reserves the date. Cancellation releases the date.
-- The booking model has no event start/end times, so one date is the smallest
-- safe reservation unit until time-window conflict handling is implemented.

begin;

create unique index if not exists bookings_one_active_talent_per_date_v1
  on public.bookings (talent_id, event_date)
  where status in ('secured', 'pre_show', 'incident', 'completed');

comment on index public.bookings_one_active_talent_per_date_v1 is
  'Prevents concurrent booking transitions from securing one talent for two briefs on the same date. Pending security and cancelled bookings do not reserve a date.';

commit;
