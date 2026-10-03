-- Nusantara Star — booking schedule hold foundation V1 (DRAFT)
-- Apply only during the coordinated reservation cutover, after
-- supabase-manager-duty-window-v1.sql. This migration has not been applied.

begin;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.booking_schedule_feasibility_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete restrict,
  proposal_item_id uuid not null references public.proposal_items(id) on delete restrict,
  talent_offer_id uuid not null references public.talent_offers(id) on delete restrict,
  talent_id uuid not null references public.talents(id) on delete restrict,
  duty_start_at timestamptz not null,
  duty_end_at timestamptz not null,
  duty_location text not null,
  decision text not null check (decision in ('approved','rejected')),
  travel_verdict text not null check (travel_verdict in ('feasible','not_feasible','insufficient_evidence')),
  nearby_commitments_snapshot jsonb not null default '[]'::jsonb,
  travel_assessment jsonb not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint booking_schedule_review_duty_check check (
    duty_start_at < duty_end_at and length(trim(duty_location)) between 3 and 300
  ),
  constraint booking_schedule_review_evidence_check check (
    jsonb_typeof(nearby_commitments_snapshot) = 'array'
    and jsonb_typeof(travel_assessment) = 'object'
    and length(trim(coalesce(travel_assessment ->> 'summary',''))) >= 10
    and length(trim(reviewed_by)) between 3 and 200
  ),
  constraint booking_schedule_review_decision_check check (
    (decision = 'approved' and travel_verdict = 'feasible')
    or (decision = 'rejected' and travel_verdict in ('not_feasible','insufficient_evidence'))
  )
);

create index if not exists idx_booking_schedule_reviews_deal
  on public.booking_schedule_feasibility_reviews(deal_id, reviewed_at desc);
create index if not exists idx_booking_schedule_reviews_proposal_item
  on public.booking_schedule_feasibility_reviews(proposal_item_id);
create index if not exists idx_booking_schedule_reviews_talent_offer
  on public.booking_schedule_feasibility_reviews(talent_offer_id);
create index if not exists idx_booking_schedule_reviews_talent
  on public.booking_schedule_feasibility_reviews(talent_id, duty_start_at, duty_end_at);

create table if not exists public.booking_schedule_reservations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  feasibility_review_id uuid not null references public.booking_schedule_feasibility_reviews(id) on delete restrict,
  deal_id uuid not null references public.deals(id) on delete restrict,
  proposal_item_id uuid not null references public.proposal_items(id) on delete restrict,
  talent_offer_id uuid not null references public.talent_offers(id) on delete restrict,
  talent_id uuid not null references public.talents(id) on delete restrict,
  duty_start_at timestamptz not null,
  duty_end_at timestamptz not null,
  duty_location text not null,
  duty_window tstzrange generated always as (tstzrange(duty_start_at, duty_end_at, '[)')) stored,
  offer_valid_until timestamptz not null,
  hold_expires_at timestamptz not null,
  status text not null default 'held' check (status in ('held','secured','released','expired')),
  held_at timestamptz not null default now(),
  secured_at timestamptz null,
  released_at timestamptz null,
  release_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_schedule_reservation_window_check check (
    duty_start_at < duty_end_at and length(trim(duty_location)) between 3 and 300
  ),
  constraint booking_schedule_reservation_cutoff_check check (
    held_at < hold_expires_at
    and hold_expires_at <= offer_valid_until
    and hold_expires_at <= duty_start_at
  ),
  constraint booking_schedule_reservation_lifecycle_check check (
    (status = 'held' and secured_at is null and released_at is null and release_reason is null)
    or (status = 'secured' and secured_at is not null and released_at is null and release_reason is null)
    or (status in ('released','expired') and released_at is not null and length(trim(coalesce(release_reason,''))) >= 3)
  )
);

create index if not exists idx_booking_schedule_reservations_booking
  on public.booking_schedule_reservations(booking_id);
create index if not exists idx_booking_schedule_reservations_review
  on public.booking_schedule_reservations(feasibility_review_id);
create index if not exists idx_booking_schedule_reservations_deal
  on public.booking_schedule_reservations(deal_id);
create index if not exists idx_booking_schedule_reservations_proposal_item
  on public.booking_schedule_reservations(proposal_item_id);
create index if not exists idx_booking_schedule_reservations_talent_offer
  on public.booking_schedule_reservations(talent_offer_id);
create index if not exists idx_booking_schedule_reservations_expiry
  on public.booking_schedule_reservations(hold_expires_at)
  where status = 'held';
create unique index if not exists idx_booking_schedule_one_active_per_booking
  on public.booking_schedule_reservations(booking_id)
  where status in ('held','secured');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_schedule_no_active_overlap'
      and conrelid = 'public.booking_schedule_reservations'::regclass
  ) then
    alter table public.booking_schedule_reservations
      add constraint booking_schedule_no_active_overlap
      exclude using gist (
        talent_id with =,
        duty_window with &&
      ) where (status in ('held','secured'));
  end if;
end $$;

alter table public.booking_schedule_feasibility_reviews enable row level security;
alter table public.booking_schedule_reservations enable row level security;

revoke all on table public.booking_schedule_feasibility_reviews from public, anon, authenticated, service_role;
revoke all on table public.booking_schedule_reservations from public, anon, authenticated, service_role;
-- SECURITY DEFINER RPCs owned by the migration owner perform all writes. Keeping
-- service_role read-only prevents it from spoofing the transition GUC and
-- bypassing the lifecycle functions with direct INSERT/UPDATE statements.
grant select on table public.booking_schedule_feasibility_reviews to service_role;
grant select on table public.booking_schedule_reservations to service_role;

create or replace function public.ns_protect_booking_schedule_review_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Schedule feasibility reviews are immutable; record a new review';
end;
$$;

drop trigger if exists trg_protect_booking_schedule_review_v1 on public.booking_schedule_feasibility_reviews;
create trigger trg_protect_booking_schedule_review_v1
before update or delete on public.booking_schedule_feasibility_reviews
for each row execute function public.ns_protect_booking_schedule_review_v1();

create or replace function public.ns_protect_booking_schedule_reservation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Schedule reservations cannot be deleted; use an authorized lifecycle transition';
  end if;
  if new.booking_id is distinct from old.booking_id
     or new.feasibility_review_id is distinct from old.feasibility_review_id
     or new.deal_id is distinct from old.deal_id
     or new.proposal_item_id is distinct from old.proposal_item_id
     or new.talent_offer_id is distinct from old.talent_offer_id
     or new.talent_id is distinct from old.talent_id
     or new.duty_start_at is distinct from old.duty_start_at
     or new.duty_end_at is distinct from old.duty_end_at
     or new.duty_location is distinct from old.duty_location
     or new.offer_valid_until is distinct from old.offer_valid_until
     or new.hold_expires_at is distinct from old.hold_expires_at
     or new.held_at is distinct from old.held_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Schedule reservation identity, interval and cutoffs are immutable';
  end if;
  if current_setting('ns.reservation_transition', true) is distinct from 'rpc' then
    raise exception 'Schedule reservation transitions must use an authorized RPC';
  end if;
  if not (
    (old.status = 'held' and new.status in ('secured','released','expired'))
    or (old.status = 'secured' and new.status = 'released')
  ) then
    raise exception 'Invalid schedule reservation transition: % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_booking_schedule_reservation_v1 on public.booking_schedule_reservations;
create trigger trg_protect_booking_schedule_reservation_v1
before update or delete on public.booking_schedule_reservations
for each row execute function public.ns_protect_booking_schedule_reservation_v1();

create or replace function public.ns_record_schedule_feasibility_review_v1(
  p_deal_id uuid,
  p_decision text,
  p_travel_verdict text,
  p_nearby_commitments_snapshot jsonb,
  p_travel_assessment jsonb,
  p_reviewed_by text
) returns public.booking_schedule_feasibility_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals%rowtype;
  pi public.proposal_items%rowtype;
  o public.talent_offers%rowtype;
  v_existing public.booking_schedule_feasibility_reviews%rowtype;
  v_review public.booking_schedule_feasibility_reviews%rowtype;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Invalid review decision'; end if;
  if p_travel_verdict not in ('feasible','not_feasible','insufficient_evidence') then raise exception 'Invalid travel verdict'; end if;
  if (p_decision = 'approved') is distinct from (p_travel_verdict = 'feasible') then
    raise exception 'Only a feasible travel verdict can be approved';
  end if;
  if jsonb_typeof(p_nearby_commitments_snapshot) is distinct from 'array' then
    raise exception 'Nearby commitments snapshot must be an array';
  end if;
  if jsonb_typeof(p_travel_assessment) is distinct from 'object'
     or length(trim(coalesce(p_travel_assessment ->> 'summary',''))) < 10 then
    raise exception 'Travel assessment requires an evidence summary';
  end if;
  if length(trim(coalesce(p_reviewed_by,''))) not between 3 and 200 then
    raise exception 'Reviewer identity is required';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found or d.status <> 'locked' then raise exception 'Deal must be locked before schedule review'; end if;

  select * into pi from public.proposal_items where id = d.proposal_item_id for share;
  if not found or pi.talent_id <> d.talent_id or pi.talent_offer_id <> d.talent_offer_id then
    raise exception 'Selected proposal item does not match the locked deal';
  end if;

  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if not found or o.brief_id <> d.brief_id or o.talent_id <> d.talent_id
     or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
    raise exception 'Talent offer is not confirmed for the locked deal';
  end if;
  if o.quote_valid_until is null or o.quote_valid_until <= now() then
    raise exception 'Talent offer has expired or has no validity';
  end if;
  if pi.duty_start_at is null or pi.duty_end_at is null or pi.duty_location is null
     or pi.duty_start_at is distinct from o.duty_start_at
     or pi.duty_end_at is distinct from o.duty_end_at
     or pi.duty_location is distinct from o.duty_location then
    raise exception 'Proposal duty snapshot is missing or no longer matches the offer';
  end if;

  select * into v_existing
  from public.booking_schedule_feasibility_reviews
  where deal_id = d.id
    and proposal_item_id = pi.id
    and talent_offer_id = o.id
    and duty_start_at = pi.duty_start_at
    and duty_end_at = pi.duty_end_at
    and duty_location = pi.duty_location
    and decision = p_decision
    and travel_verdict = p_travel_verdict
    and nearby_commitments_snapshot = p_nearby_commitments_snapshot
    and travel_assessment = p_travel_assessment
    and reviewed_by = trim(p_reviewed_by)
  order by reviewed_at desc
  limit 1;
  if found then return v_existing; end if;

  insert into public.booking_schedule_feasibility_reviews (
    deal_id, proposal_item_id, talent_offer_id, talent_id,
    duty_start_at, duty_end_at, duty_location,
    decision, travel_verdict, nearby_commitments_snapshot,
    travel_assessment, reviewed_by
  ) values (
    d.id, pi.id, o.id, d.talent_id,
    pi.duty_start_at, pi.duty_end_at, pi.duty_location,
    p_decision, p_travel_verdict, p_nearby_commitments_snapshot,
    p_travel_assessment, trim(p_reviewed_by)
  ) returning * into v_review;
  return v_review;
end;
$$;

create or replace function public.ns_hold_booking_schedule_v1(
  p_booking_id uuid,
  p_feasibility_review_id uuid,
  p_hold_expires_at timestamptz
) returns public.booking_schedule_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  pi public.proposal_items%rowtype;
  o public.talent_offers%rowtype;
  r public.booking_schedule_feasibility_reviews%rowtype;
  v_existing public.booking_schedule_reservations%rowtype;
  v_reservation public.booking_schedule_reservations%rowtype;
  v_now timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pending_security' then raise exception 'Booking is not awaiting security'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;
  if b.buyer_terms_accepted_at is not null then
    raise exception 'Initial hold must exist before buyer terms acceptance';
  end if;

  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then
    raise exception 'Booking and locked deal chain do not match';
  end if;

  -- Serialize all hold acquisition/expiry work for this talent. The exclusion
  -- constraint below remains the final database-enforced overlap guarantee.
  perform pg_advisory_xact_lock(hashtext('ns_talent_schedule'), hashtext(d.talent_id::text));

  select * into pi from public.proposal_items where id = d.proposal_item_id for share;
  if not found or pi.talent_id <> d.talent_id or pi.talent_offer_id <> d.talent_offer_id then
    raise exception 'Selected proposal item does not match the locked deal';
  end if;

  select * into o from public.talent_offers where id = d.talent_offer_id for share;
  if not found or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id
     or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
    raise exception 'Talent offer requires reconfirmation';
  end if;
  if o.quote_valid_until is null or o.quote_valid_until <= v_now then
    raise exception 'Talent offer has expired or has no validity';
  end if;
  if pi.duty_start_at is null or pi.duty_end_at is null or pi.duty_location is null
     or pi.duty_start_at is distinct from o.duty_start_at
     or pi.duty_end_at is distinct from o.duty_end_at
     or pi.duty_location is distinct from o.duty_location then
    raise exception 'Proposal duty snapshot is missing or no longer matches the offer';
  end if;
  if p_hold_expires_at is null or p_hold_expires_at <= v_now
     or p_hold_expires_at > o.quote_valid_until
     or p_hold_expires_at > pi.duty_start_at then
    raise exception 'Hold expiry must be future-dated and no later than offer validity or duty start';
  end if;

  select * into r
  from public.booking_schedule_feasibility_reviews
  where id = p_feasibility_review_id for share;
  if not found or r.decision <> 'approved' or r.travel_verdict <> 'feasible'
     or r.deal_id <> d.id or r.proposal_item_id <> pi.id
     or r.talent_offer_id <> o.id or r.talent_id <> d.talent_id
     or r.duty_start_at is distinct from pi.duty_start_at
     or r.duty_end_at is distinct from pi.duty_end_at
     or r.duty_location is distinct from pi.duty_location then
    raise exception 'An approved feasibility review for the exact duty snapshot is required';
  end if;

  select * into v_existing
  from public.booking_schedule_reservations
  where booking_id = b.id and status in ('held','secured')
  for update;
  if found then
    if v_existing.feasibility_review_id = r.id
       and v_existing.deal_id = d.id
       and v_existing.duty_start_at = pi.duty_start_at
       and v_existing.duty_end_at = pi.duty_end_at
       and v_existing.duty_location = pi.duty_location
       and v_existing.hold_expires_at = p_hold_expires_at then
      return v_existing;
    end if;
    raise exception 'Booking already has a different active schedule reservation';
  end if;

  -- Installed by the final security migration at coordinated cutover. The
  -- helper rechecks locked bookings and skips busy rows; it never waits for
  -- another booking while this transaction owns the talent schedule lock.
  perform public.ns_expire_untouched_holds_v1(d.talent_id);

  begin
    insert into public.booking_schedule_reservations (
      booking_id, feasibility_review_id, deal_id, proposal_item_id,
      talent_offer_id, talent_id, duty_start_at, duty_end_at, duty_location,
      offer_valid_until, hold_expires_at, status, held_at
    ) values (
      b.id, r.id, d.id, pi.id,
      o.id, d.talent_id, pi.duty_start_at, pi.duty_end_at, pi.duty_location,
      o.quote_valid_until, p_hold_expires_at, 'held', v_now
    ) returning * into v_reservation;
  exception when exclusion_violation then
    raise exception using
      errcode = '23P01',
      message = 'Talent already has an overlapping active duty reservation';
  end;

  return v_reservation;
end;
$$;

revoke all on function public.ns_protect_booking_schedule_review_v1() from public, anon, authenticated;
revoke all on function public.ns_protect_booking_schedule_reservation_v1() from public, anon, authenticated;
revoke all on function public.ns_record_schedule_feasibility_review_v1(uuid,text,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.ns_hold_booking_schedule_v1(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_schedule_feasibility_review_v1(uuid,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.ns_hold_booking_schedule_v1(uuid,uuid,timestamptz) to service_role;

comment on table public.booking_schedule_feasibility_reviews is
  'Immutable admin evidence that the exact selected duty block and travel/turnaround context were reviewed.';
comment on table public.booking_schedule_reservations is
  'Database-enforced half-open duty reservations. Held and secured rows for one talent cannot overlap.';
comment on constraint booking_schedule_no_active_overlap on public.booking_schedule_reservations is
  'Adjacent [start,end) duty blocks are allowed; any positive overlap for held/secured reservations is rejected atomically.';
comment on function public.ns_record_schedule_feasibility_review_v1(uuid,text,text,jsonb,jsonb,text) is
  'Records an immutable human feasibility decision against the exact locked offer/proposal duty snapshot.';
comment on function public.ns_hold_booking_schedule_v1(uuid,uuid,timestamptz) is
  'Acquires an idempotent held reservation after exact-chain and feasibility rechecks; overlapping active duty blocks fail atomically.';

commit;
