-- Nusantara Star — Show Advance / Booking Confirmation V1
-- Production schema was applied through Supabase migrations before this canonical source file was committed.

create table if not exists public.booking_advances (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  revision_no integer not null default 1 check (revision_no > 0),
  status text not null default 'draft' check (status in ('draft','confirmed')),
  event_timezone text not null default 'Asia/Jakarta',
  venue_name text null,
  venue_address text null,
  load_in_at_local timestamp without time zone null,
  call_at_local timestamp without time zone null,
  soundcheck_at_local timestamp without time zone null,
  show_start_at_local timestamp without time zone null,
  show_end_at_local timestamp without time zone null,
  performance_duration_minutes integer null check (performance_duration_minutes is null or performance_duration_minutes > 0),
  buyer_pic_name text null,
  buyer_pic_phone text null,
  onsite_pic_name text null,
  onsite_pic_phone text null,
  technical_pic_name text null,
  technical_pic_phone text null,
  talent_pic_name text null,
  talent_pic_phone text null,
  personnel_count integer null check (personnel_count is null or personnel_count > 0),
  lineup_notes text null,
  transport_notes text null,
  accommodation_notes text null,
  hospitality_notes text null,
  technical_notes text null,
  backline_notes text null,
  access_loading_notes text null,
  parking_notes text null,
  rider_version_id uuid null references public.talent_rider_versions(id) on delete restrict,
  internal_notes text null,
  buyer_confirmation_reference text null,
  talent_confirmation_reference text null,
  buyer_confirmed_at timestamptz null,
  talent_confirmed_at timestamptz null,
  confirmed_revision_no integer null,
  confirmed_snapshot jsonb null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (confirmed_snapshot is null or jsonb_typeof(confirmed_snapshot) = 'object'),
  check (
    status = 'draft'
    or (
      status = 'confirmed'
      and buyer_confirmation_reference is not null
      and talent_confirmation_reference is not null
      and buyer_confirmed_at is not null
      and talent_confirmed_at is not null
      and confirmed_revision_no = revision_no
      and confirmed_snapshot is not null
      and confirmed_at is not null
    )
  )
);

create table if not exists public.booking_advance_confirmations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  buyer_confirmation_reference text not null,
  talent_confirmation_reference text not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (booking_id, revision_no)
);

create index if not exists idx_booking_advances_status on public.booking_advances(status);
create index if not exists idx_booking_advance_confirmations_booking on public.booking_advance_confirmations(booking_id, revision_no desc);

alter table public.booking_advances enable row level security;
alter table public.booking_advance_confirmations enable row level security;

create or replace function public.ns_save_booking_advance_v1(p_booking_id uuid, p_payload jsonb)
returns public.booking_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  existing public.booking_advances%rowtype;
  result_row public.booking_advances%rowtype;
  v_timezone text := trim(coalesce(p_payload->>'event_timezone','Asia/Jakarta'));
  v_rider uuid := null;
  v_perf integer := null;
  v_personnel integer := null;
  v_load timestamp without time zone := null;
  v_call timestamp without time zone := null;
  v_sound timestamp without time zone := null;
  v_start timestamp without time zone := null;
  v_end timestamp without time zone := null;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Show Advance payload must be an object'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Show Advance can only be edited for secured or pre-show bookings'; end if;

  if v_timezone = '' or not exists (select 1 from pg_timezone_names where name = v_timezone) then raise exception 'Invalid event timezone'; end if;

  begin
    if nullif(trim(coalesce(p_payload->>'rider_version_id','')), '') is not null then v_rider := (p_payload->>'rider_version_id')::uuid; end if;
    if nullif(trim(coalesce(p_payload->>'performance_duration_minutes','')), '') is not null then v_perf := (p_payload->>'performance_duration_minutes')::integer; end if;
    if nullif(trim(coalesce(p_payload->>'personnel_count','')), '') is not null then v_personnel := (p_payload->>'personnel_count')::integer; end if;
    if nullif(trim(coalesce(p_payload->>'load_in_at_local','')), '') is not null then v_load := (p_payload->>'load_in_at_local')::timestamp without time zone; end if;
    if nullif(trim(coalesce(p_payload->>'call_at_local','')), '') is not null then v_call := (p_payload->>'call_at_local')::timestamp without time zone; end if;
    if nullif(trim(coalesce(p_payload->>'soundcheck_at_local','')), '') is not null then v_sound := (p_payload->>'soundcheck_at_local')::timestamp without time zone; end if;
    if nullif(trim(coalesce(p_payload->>'show_start_at_local','')), '') is not null then v_start := (p_payload->>'show_start_at_local')::timestamp without time zone; end if;
    if nullif(trim(coalesce(p_payload->>'show_end_at_local','')), '') is not null then v_end := (p_payload->>'show_end_at_local')::timestamp without time zone; end if;
  exception when others then
    raise exception 'Show Advance contains an invalid number, UUID, or local date/time';
  end;

  if v_perf is not null and v_perf <= 0 then raise exception 'Performance duration must be positive'; end if;
  if v_personnel is not null and v_personnel <= 0 then raise exception 'Personnel count must be positive'; end if;
  if v_rider is not null and not exists (
    select 1 from public.talent_rider_versions r
    where r.id = v_rider and r.talent_id = b.talent_id and r.status = 'admin_approved'
  ) then raise exception 'Selected rider is not an admin-approved rider for this talent'; end if;

  select * into existing from public.booking_advances where booking_id = p_booking_id for update;

  if found then
    update public.booking_advances
    set revision_no = existing.revision_no + 1,
        status = 'draft',
        event_timezone = v_timezone,
        venue_name = nullif(trim(coalesce(p_payload->>'venue_name','')), ''),
        venue_address = nullif(trim(coalesce(p_payload->>'venue_address','')), ''),
        load_in_at_local = v_load,
        call_at_local = v_call,
        soundcheck_at_local = v_sound,
        show_start_at_local = v_start,
        show_end_at_local = v_end,
        performance_duration_minutes = v_perf,
        buyer_pic_name = nullif(trim(coalesce(p_payload->>'buyer_pic_name','')), ''),
        buyer_pic_phone = nullif(trim(coalesce(p_payload->>'buyer_pic_phone','')), ''),
        onsite_pic_name = nullif(trim(coalesce(p_payload->>'onsite_pic_name','')), ''),
        onsite_pic_phone = nullif(trim(coalesce(p_payload->>'onsite_pic_phone','')), ''),
        technical_pic_name = nullif(trim(coalesce(p_payload->>'technical_pic_name','')), ''),
        technical_pic_phone = nullif(trim(coalesce(p_payload->>'technical_pic_phone','')), ''),
        talent_pic_name = nullif(trim(coalesce(p_payload->>'talent_pic_name','')), ''),
        talent_pic_phone = nullif(trim(coalesce(p_payload->>'talent_pic_phone','')), ''),
        personnel_count = v_personnel,
        lineup_notes = nullif(trim(coalesce(p_payload->>'lineup_notes','')), ''),
        transport_notes = nullif(trim(coalesce(p_payload->>'transport_notes','')), ''),
        accommodation_notes = nullif(trim(coalesce(p_payload->>'accommodation_notes','')), ''),
        hospitality_notes = nullif(trim(coalesce(p_payload->>'hospitality_notes','')), ''),
        technical_notes = nullif(trim(coalesce(p_payload->>'technical_notes','')), ''),
        backline_notes = nullif(trim(coalesce(p_payload->>'backline_notes','')), ''),
        access_loading_notes = nullif(trim(coalesce(p_payload->>'access_loading_notes','')), ''),
        parking_notes = nullif(trim(coalesce(p_payload->>'parking_notes','')), ''),
        rider_version_id = v_rider,
        internal_notes = nullif(trim(coalesce(p_payload->>'internal_notes','')), ''),
        buyer_confirmation_reference = null,
        talent_confirmation_reference = null,
        buyer_confirmed_at = null,
        talent_confirmed_at = null,
        confirmed_revision_no = null,
        confirmed_snapshot = null,
        confirmed_at = null,
        updated_at = now()
    where booking_id = p_booking_id
    returning * into result_row;
  else
    insert into public.booking_advances (
      booking_id,revision_no,status,event_timezone,venue_name,venue_address,load_in_at_local,call_at_local,soundcheck_at_local,
      show_start_at_local,show_end_at_local,performance_duration_minutes,buyer_pic_name,buyer_pic_phone,onsite_pic_name,
      onsite_pic_phone,technical_pic_name,technical_pic_phone,talent_pic_name,talent_pic_phone,personnel_count,lineup_notes,
      transport_notes,accommodation_notes,hospitality_notes,technical_notes,backline_notes,access_loading_notes,parking_notes,
      rider_version_id,internal_notes
    ) values (
      p_booking_id,1,'draft',v_timezone,
      nullif(trim(coalesce(p_payload->>'venue_name','')), ''),
      nullif(trim(coalesce(p_payload->>'venue_address','')), ''),
      v_load,v_call,v_sound,v_start,v_end,v_perf,
      nullif(trim(coalesce(p_payload->>'buyer_pic_name','')), ''),
      nullif(trim(coalesce(p_payload->>'buyer_pic_phone','')), ''),
      nullif(trim(coalesce(p_payload->>'onsite_pic_name','')), ''),
      nullif(trim(coalesce(p_payload->>'onsite_pic_phone','')), ''),
      nullif(trim(coalesce(p_payload->>'technical_pic_name','')), ''),
      nullif(trim(coalesce(p_payload->>'technical_pic_phone','')), ''),
      nullif(trim(coalesce(p_payload->>'talent_pic_name','')), ''),
      nullif(trim(coalesce(p_payload->>'talent_pic_phone','')), ''),
      v_personnel,
      nullif(trim(coalesce(p_payload->>'lineup_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'transport_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'accommodation_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'hospitality_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'technical_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'backline_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'access_loading_notes','')), ''),
      nullif(trim(coalesce(p_payload->>'parking_notes','')), ''),
      v_rider,
      nullif(trim(coalesce(p_payload->>'internal_notes','')), '')
    ) returning * into result_row;
  end if;

  return result_row;
end;
$$;

create or replace function public.ns_confirm_booking_advance_v1(
  p_booking_id uuid,
  p_buyer_confirmation_reference text,
  p_talent_confirmation_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_buyer_ref text := trim(coalesce(p_buyer_confirmation_reference,''));
  v_talent_ref text := trim(coalesce(p_talent_confirmation_reference,''));
  v_now timestamptz := now();
  v_snapshot jsonb;
  v_has_approved_rider boolean;
begin
  if v_buyer_ref = '' or v_talent_ref = '' then raise exception 'Buyer and talent confirmation references are required'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking is not eligible for Show Advance confirmation'; end if;

  select * into a from public.booking_advances where booking_id = p_booking_id for update;
  if not found then raise exception 'Show Advance has not been saved'; end if;

  if a.status='confirmed' and a.confirmed_revision_no=a.revision_no and a.confirmed_snapshot is not null and a.confirmed_at is not null then
    return jsonb_build_object('ok',true,'bookingId',p_booking_id,'revisionNo',a.revision_no,'status','confirmed','confirmedAt',a.confirmed_at,'alreadyConfirmed',true);
  end if;

  if coalesce(trim(a.venue_name),'')='' or coalesce(trim(a.venue_address),'')='' then raise exception 'Venue name and exact address are required'; end if;
  if a.call_at_local is null or a.show_start_at_local is null then raise exception 'Call time and show start time are required'; end if;
  if a.performance_duration_minutes is null or a.performance_duration_minutes<=0 then raise exception 'Performance duration is required'; end if;
  if a.personnel_count is null or a.personnel_count<=0 then raise exception 'Personnel count is required'; end if;
  if coalesce(trim(a.onsite_pic_name),'')='' or coalesce(trim(a.onsite_pic_phone),'')='' then raise exception 'Onsite PIC name and phone are required'; end if;
  if coalesce(trim(a.talent_pic_name),'')='' or coalesce(trim(a.talent_pic_phone),'')='' then raise exception 'Talent/manager operational PIC name and phone are required'; end if;
  if a.call_at_local > a.show_start_at_local then raise exception 'Call time cannot be after show start'; end if;
  if a.soundcheck_at_local is not null and (a.soundcheck_at_local<a.call_at_local or a.soundcheck_at_local>a.show_start_at_local) then raise exception 'Soundcheck must be between call time and show start'; end if;
  if a.load_in_at_local is not null and a.load_in_at_local>a.show_start_at_local then raise exception 'Load-in cannot be after show start'; end if;
  if a.show_end_at_local is not null and a.show_end_at_local<=a.show_start_at_local then raise exception 'Show end must be after show start'; end if;
  if a.show_start_at_local::date<b.event_date or a.show_start_at_local::date>b.event_date+1 then raise exception 'Show start must fall on the booking event date or the following calendar day'; end if;

  select exists(select 1 from public.talent_rider_versions r where r.talent_id=b.talent_id and r.status='admin_approved') into v_has_approved_rider;
  if v_has_approved_rider and a.rider_version_id is null then raise exception 'Select the final admin-approved rider before confirming Show Advance'; end if;
  if a.rider_version_id is not null and not exists(select 1 from public.talent_rider_versions r where r.id=a.rider_version_id and r.talent_id=b.talent_id and r.status='admin_approved') then raise exception 'Selected rider is no longer an approved rider for this talent'; end if;

  v_snapshot := jsonb_build_object(
    'schema_version',1,'booking_id',b.id,'brief_id',b.brief_id,'talent_id',b.talent_id,'event_date',b.event_date,'revision_no',a.revision_no,
    'event_timezone',a.event_timezone,'venue_name',a.venue_name,'venue_address',a.venue_address,'load_in_at_local',a.load_in_at_local,
    'call_at_local',a.call_at_local,'soundcheck_at_local',a.soundcheck_at_local,'show_start_at_local',a.show_start_at_local,
    'show_end_at_local',a.show_end_at_local,'performance_duration_minutes',a.performance_duration_minutes,'buyer_pic_name',a.buyer_pic_name,
    'buyer_pic_phone',a.buyer_pic_phone,'onsite_pic_name',a.onsite_pic_name,'onsite_pic_phone',a.onsite_pic_phone,
    'technical_pic_name',a.technical_pic_name,'technical_pic_phone',a.technical_pic_phone,'talent_pic_name',a.talent_pic_name,
    'talent_pic_phone',a.talent_pic_phone,'personnel_count',a.personnel_count,'lineup_notes',a.lineup_notes,'transport_notes',a.transport_notes,
    'accommodation_notes',a.accommodation_notes,'hospitality_notes',a.hospitality_notes,'technical_notes',a.technical_notes,
    'backline_notes',a.backline_notes,'access_loading_notes',a.access_loading_notes,'parking_notes',a.parking_notes,'rider_version_id',a.rider_version_id,
    'buyer_confirmation_reference',v_buyer_ref,'talent_confirmation_reference',v_talent_ref,'confirmed_at',v_now
  );

  update public.booking_advances
  set status='confirmed',buyer_confirmation_reference=v_buyer_ref,talent_confirmation_reference=v_talent_ref,
      buyer_confirmed_at=v_now,talent_confirmed_at=v_now,confirmed_revision_no=revision_no,
      confirmed_snapshot=v_snapshot,confirmed_at=v_now,updated_at=v_now
  where booking_id=p_booking_id
  returning * into a;

  insert into public.booking_advance_confirmations(booking_id,revision_no,snapshot,buyer_confirmation_reference,talent_confirmation_reference,confirmed_at)
  values(p_booking_id,a.revision_no,v_snapshot,v_buyer_ref,v_talent_ref,v_now);

  return jsonb_build_object('ok',true,'bookingId',p_booking_id,'revisionNo',a.revision_no,'status','confirmed','confirmedAt',v_now,'alreadyConfirmed',false);
end;
$$;

create or replace function public.ns_protect_booking_advance_confirmation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP='DELETE' and pg_trigger_depth()>1 then return old; end if;
  raise exception 'Show Advance confirmation history is append-only';
end;
$$;

drop trigger if exists trg_protect_booking_advance_confirmation_v1 on public.booking_advance_confirmations;
create trigger trg_protect_booking_advance_confirmation_v1
before update or delete on public.booking_advance_confirmations
for each row execute function public.ns_protect_booking_advance_confirmation_v1();

create or replace function public.ns_initialize_pre_show_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_count integer;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking must be secured before pre-show'; end if;
  if b.event_date is null then raise exception 'Booking event date is required'; end if;

  select * into a from public.booking_advances where booking_id=p_booking_id;
  if not found or a.status<>'confirmed' or a.confirmed_revision_no is distinct from a.revision_no or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed by buyer and talent before pre-show starts';
  end if;

  insert into public.pre_show_checklist_items(booking_id,checkpoint_code,item_key,label,due_date)
  values
    (b.id,'H-14','show_advance','Show Advance version confirmed by buyer & talent',b.event_date-14),
    (b.id,'H-14','venue_access','Venue address, access/loading & onsite PIC reconfirmed',b.event_date-14),
    (b.id,'H-7','rider_final','Final rider / technical requirements reconfirmed',b.event_date-7),
    (b.id,'H-7','lineup_backline','Personnel, lineup & backline reconfirmed',b.event_date-7),
    (b.id,'H-3','logistics','Transport, accommodation & hospitality reconfirmed',b.event_date-3),
    (b.id,'H-3','payment_status','Buyer payment status reviewed against schedule',b.event_date-3),
    (b.id,'H-1','call_sheet','Load-in, call, soundcheck & show time reconfirmed',b.event_date-1),
    (b.id,'H-1','emergency_contacts','Onsite, talent & technical contacts reconfirmed',b.event_date-1)
  on conflict (booking_id,checkpoint_code,item_key) do nothing;

  if b.status='secured' then
    update public.bookings set status='pre_show',pre_show_at=coalesce(pre_show_at,now()),updated_at=now()
    where id=b.id and status='secured';
    if not found then raise exception 'Pre-show transition lost a concurrent update'; end if;
  end if;

  select count(*)::integer into v_count from public.pre_show_checklist_items where booking_id=b.id;
  return jsonb_build_object('ok',true,'status','pre_show','checklistCount',v_count,'advanceRevision',a.revision_no);
end;
$$;

create or replace function public.ns_complete_show_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_open integer;
  v_completed timestamptz := now();
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking is not ready for completion'; end if;

  select * into a from public.booking_advances where booking_id=p_booking_id;
  if not found or a.status<>'confirmed' or a.confirmed_revision_no is distinct from a.revision_no or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed before show completion';
  end if;

  select count(*)::integer into v_open from public.incidents where booking_id=b.id and status='open';
  if v_open>0 then raise exception 'Resolve open incidents before completing the show'; end if;

  update public.bookings set status='completed',completed_at=v_completed,updated_at=v_completed
  where id=b.id and status in ('secured','pre_show');
  if not found then raise exception 'Show completion lost a concurrent update'; end if;

  update public.briefs set status='closed',updated_at=v_completed where id=b.brief_id and status='booked';
  return jsonb_build_object('ok',true,'bookingStatus','completed','completedAt',v_completed);
end;
$$;

revoke all on function public.ns_save_booking_advance_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ns_save_booking_advance_v1(uuid,jsonb) to service_role;
revoke all on function public.ns_confirm_booking_advance_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ns_confirm_booking_advance_v1(uuid,text,text) to service_role;
revoke all on function public.ns_protect_booking_advance_confirmation_v1() from public,anon,authenticated;
grant execute on function public.ns_protect_booking_advance_confirmation_v1() to service_role;
revoke all on function public.ns_initialize_pre_show_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_initialize_pre_show_v1(uuid) to service_role;
revoke all on function public.ns_complete_show_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_complete_show_v1(uuid) to service_role;

comment on table public.booking_advances is 'Current mutable operational Show Advance. Any edit after confirmation creates a new revision and invalidates prior confirmation.';
comment on table public.booking_advance_confirmations is 'Append-only confirmation history for Show Advance revisions.';
