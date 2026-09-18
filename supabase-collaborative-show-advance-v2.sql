-- Nusantara Star — Collaborative Show Advance V2
-- Buyer/EO and Talent/Manager own their respective operational inputs.
-- Admin reviews the merged revision but does not enter party-owned data.

alter table public.booking_advances
  add column if not exists buyer_submission jsonb null,
  add column if not exists talent_submission jsonb null,
  add column if not exists buyer_submitted_at timestamptz null,
  add column if not exists talent_submitted_at timestamptz null,
  add column if not exists admin_reviewed_revision_no integer null,
  add column if not exists admin_reviewed_at timestamptz null,
  add column if not exists talent_operational_notes text null;

alter table public.booking_advances drop constraint if exists booking_advances_buyer_submission_object_check;
alter table public.booking_advances add constraint booking_advances_buyer_submission_object_check
  check (buyer_submission is null or jsonb_typeof(buyer_submission)='object');

alter table public.booking_advances drop constraint if exists booking_advances_talent_submission_object_check;
alter table public.booking_advances add constraint booking_advances_talent_submission_object_check
  check (talent_submission is null or jsonb_typeof(talent_submission)='object');

create table if not exists public.booking_advance_party_actions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  party text not null check (party in ('buyer','talent','admin')),
  action text not null check (action in ('submitted','reviewed','confirmed')),
  source text not null default 'signed_link',
  payload_snapshot jsonb null check (payload_snapshot is null or jsonb_typeof(payload_snapshot)='object'),
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_advance_party_actions_booking
  on public.booking_advance_party_actions(booking_id, revision_no desc, created_at desc);

alter table public.booking_advance_party_actions enable row level security;
revoke all on table public.booking_advance_party_actions from public, anon, authenticated;
grant select,insert,update,delete on table public.booking_advance_party_actions to service_role;

-- Function bodies are intentionally kept in the production migration history.
-- Canonical behavior:
-- ns_save_booking_advance_party_v2(uuid,text,jsonb):
--   buyer may update buyer-owned fields only; talent may update talent-owned fields only;
--   every save increments revision and invalidates review/confirmations.
-- ns_review_booking_advance_v2(uuid):
--   requires both submissions and validates merged operational completeness.
-- ns_confirm_booking_advance_party_v2(uuid,text):
--   requires the current revision to be admin-reviewed; final status becomes confirmed
--   only after both signed parties confirm the same revision.
-- ns_save_booking_advance_v1 / ns_confirm_booking_advance_v1:
--   deprecated and raise an exception to prevent admin-owned operational input.

revoke all on function public.ns_save_booking_advance_party_v2(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ns_save_booking_advance_party_v2(uuid,text,jsonb) to service_role;
revoke all on function public.ns_review_booking_advance_v2(uuid) from public,anon,authenticated;
grant execute on function public.ns_review_booking_advance_v2(uuid) to service_role;
revoke all on function public.ns_confirm_booking_advance_party_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.ns_confirm_booking_advance_party_v2(uuid,text) to service_role;
