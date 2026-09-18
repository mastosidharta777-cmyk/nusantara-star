-- Nusantara Star — Post-Show Confirmation V1
-- Production migration applied 2026-09-19.

alter table public.bookings
  add column if not exists completion_source text,
  add column if not exists completion_notes text,
  add column if not exists completion_advance_revision_no integer;

alter table public.bookings
  drop constraint if exists bookings_completion_source_check;
alter table public.bookings
  add constraint bookings_completion_source_check
  check (completion_source is null or completion_source in ('both_parties','admin_override'));

create table if not exists public.post_show_confirmations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  party text not null check (party in ('buyer','talent')),
  outcome text not null check (outcome in ('performed_as_agreed','performed_with_issue','not_performed')),
  note text,
  advance_revision_no integer not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, party)
);

alter table public.post_show_confirmations enable row level security;
revoke all on table public.post_show_confirmations from public, anon, authenticated;
grant select, insert, update, delete on table public.post_show_confirmations to service_role;

create or replace function public.ns_set_post_show_confirmation_v1(
  p_booking_id uuid,
  p_party text,
  p_outcome text,
  p_note text default null
)
returns public.post_show_confirmations
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  result_row public.post_show_confirmations%rowtype;
begin
  if p_party not in ('buyer','talent') then raise exception 'Invalid post-show party'; end if;
  if p_outcome not in ('performed_as_agreed','performed_with_issue','not_performed') then
    raise exception 'Invalid post-show outcome';
  end if;
  if p_outcome <> 'performed_as_agreed' and coalesce(trim(p_note),'') = '' then
    raise exception 'A note is required when the performance was not completed as agreed';
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pre_show','incident') then
    raise exception 'Post-show confirmation is only available during active show operations';
  end if;

  select * into a from public.booking_advances where booking_id=b.id;
  if not found
     or a.status <> 'confirmed'
     or a.confirmed_revision_no is distinct from a.revision_no
     or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed before post-show confirmation';
  end if;

  insert into public.post_show_confirmations(
    booking_id,party,outcome,note,advance_revision_no,confirmed_at,updated_at
  )
  values(
    b.id,p_party,p_outcome,nullif(trim(coalesce(p_note,'')),''),a.revision_no,now(),now()
  )
  on conflict (booking_id,party)
  do update set
    outcome=excluded.outcome,
    note=excluded.note,
    advance_revision_no=excluded.advance_revision_no,
    confirmed_at=now(),
    updated_at=now()
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.ns_set_post_show_confirmation_v1(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ns_set_post_show_confirmation_v1(uuid,text,text,text) to service_role;

create or replace function public.ns_complete_show_v2(
  p_booking_id uuid,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_open integer;
  v_pending integer;
  v_total integer;
  v_completed timestamptz:=now();
  v_buyer_ok boolean:=false;
  v_talent_ok boolean:=false;
  v_source text;
  v_override text:=nullif(trim(coalesce(p_override_reason,'')),'');
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pre_show' then
    raise exception 'Pre-show checklist must be initialized before show completion';
  end if;

  select * into a from public.booking_advances where booking_id=p_booking_id;
  if not found
     or a.status <> 'confirmed'
     or a.confirmed_revision_no is distinct from a.revision_no
     or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed before show completion';
  end if;

  select count(*)::integer,
         count(*) filter (where status='pending' or advance_revision_no is distinct from a.revision_no)::integer
  into v_total,v_pending
  from public.pre_show_checklist_items
  where booking_id=b.id;

  if v_total=0 then raise exception 'Pre-show checklist has not been initialized'; end if;
  if v_pending>0 then raise exception 'Complete all current pre-show tasks before show completion'; end if;

  select count(*)::integer into v_open
  from public.incidents
  where booking_id=b.id and status='open';
  if v_open>0 then raise exception 'Resolve open incidents before completing the show'; end if;

  select exists(
    select 1 from public.post_show_confirmations
    where booking_id=b.id and party='buyer'
      and outcome='performed_as_agreed'
      and advance_revision_no=a.revision_no
  ) into v_buyer_ok;

  select exists(
    select 1 from public.post_show_confirmations
    where booking_id=b.id and party='talent'
      and outcome='performed_as_agreed'
      and advance_revision_no=a.revision_no
  ) into v_talent_ok;

  if not (v_buyer_ok and v_talent_ok) and v_override is null then
    raise exception 'Buyer and Talent post-show confirmations are required, or admin must provide an override reason';
  end if;

  v_source:=case when v_buyer_ok and v_talent_ok then 'both_parties' else 'admin_override' end;

  update public.bookings
  set status='completed',
      completed_at=v_completed,
      completion_source=v_source,
      completion_notes=case when v_source='admin_override' then v_override else null end,
      completion_advance_revision_no=a.revision_no,
      updated_at=v_completed
  where id=b.id and status='pre_show';
  if not found then raise exception 'Show completion lost a concurrent update'; end if;

  update public.briefs
  set status='closed',updated_at=v_completed
  where id=b.brief_id and status='booked';

  return jsonb_build_object(
    'ok',true,
    'bookingStatus','completed',
    'completedAt',v_completed,
    'completionSource',v_source,
    'buyerConfirmed',v_buyer_ok,
    'talentConfirmed',v_talent_ok
  );
end;
$$;

revoke all on function public.ns_complete_show_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.ns_complete_show_v2(uuid,text) to service_role;

create or replace function public.ns_complete_show_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  return public.ns_complete_show_v2(p_booking_id,null);
end;
$$;

revoke all on function public.ns_complete_show_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_complete_show_v1(uuid) to service_role;
