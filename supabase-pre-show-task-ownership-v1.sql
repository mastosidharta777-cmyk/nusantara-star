-- Nusantara Star — Pre-Show Task Ownership V1
-- Canonical source matching the production migration applied on 2026-09-18.

alter table public.pre_show_checklist_items
  add column if not exists required_parties text[] not null default array['admin']::text[],
  add column if not exists advance_revision_no integer null;

alter table public.pre_show_checklist_items
  drop constraint if exists pre_show_checklist_items_required_parties_check;
alter table public.pre_show_checklist_items
  add constraint pre_show_checklist_items_required_parties_check
  check (
    cardinality(required_parties) > 0
    and required_parties <@ array['buyer','talent','admin','system']::text[]
  );

alter table public.pre_show_checklist_items
  drop constraint if exists pre_show_checklist_items_advance_revision_no_check;
alter table public.pre_show_checklist_items
  add constraint pre_show_checklist_items_advance_revision_no_check
  check (advance_revision_no is null or advance_revision_no > 0);

create table if not exists public.pre_show_task_confirmations (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.pre_show_checklist_items(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  party text not null check (party in ('buyer','talent','admin','system')),
  response text not null check (response in ('done','not_applicable')),
  note text null,
  advance_revision_no integer not null check (advance_revision_no > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(checklist_item_id, party, advance_revision_no)
);

create index if not exists idx_pre_show_task_confirmations_booking
  on public.pre_show_task_confirmations(booking_id, advance_revision_no, party);

alter table public.pre_show_task_confirmations enable row level security;
revoke all on table public.pre_show_task_confirmations from public, anon, authenticated;
grant select, insert, update, delete on table public.pre_show_task_confirmations to service_role;

create or replace function public.ns_set_pre_show_task_party_v1(
  p_booking_id uuid,
  p_item_id uuid,
  p_party text,
  p_response text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  i public.pre_show_checklist_items%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_required integer;
  v_confirmed integer;
  v_not_applicable integer;
  v_status text;
begin
  if p_party not in ('buyer','talent','admin') then raise exception 'Invalid pre-show party'; end if;
  if p_response not in ('done','not_applicable') then raise exception 'Invalid pre-show response'; end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pre_show' then raise exception 'Booking is not in pre-show'; end if;

  select * into a from public.booking_advances where booking_id=b.id;
  if not found
     or a.status <> 'confirmed'
     or a.confirmed_revision_no is distinct from a.revision_no
     or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed before pre-show task updates';
  end if;

  select * into i
  from public.pre_show_checklist_items
  where id=p_item_id and booking_id=b.id
  for update;
  if not found then raise exception 'Pre-show task not found'; end if;

  if i.advance_revision_no is distinct from a.revision_no then
    raise exception 'Pre-show task belongs to an older Show Advance revision';
  end if;

  if not (p_party = any(i.required_parties)) then
    raise exception 'This party does not own this pre-show task';
  end if;

  insert into public.pre_show_task_confirmations(
    checklist_item_id,booking_id,party,response,note,advance_revision_no
  )
  values(i.id,b.id,p_party,p_response,v_note,a.revision_no)
  on conflict(checklist_item_id,party,advance_revision_no)
  do update set response=excluded.response,note=excluded.note,updated_at=now();

  v_required := cardinality(i.required_parties);

  select count(*)::integer,
         count(*) filter (where c.response='not_applicable')::integer
  into v_confirmed,v_not_applicable
  from public.pre_show_task_confirmations c
  where c.checklist_item_id=i.id
    and c.advance_revision_no=a.revision_no
    and c.party=any(i.required_parties);

  if v_confirmed < v_required then
    v_status := 'pending';
  elsif v_not_applicable = v_required then
    v_status := 'not_applicable';
  else
    v_status := 'done';
  end if;

  update public.pre_show_checklist_items
  set status=v_status,
      completed_at=case when v_status='pending' then null else now() end,
      updated_at=now()
  where id=i.id;

  return jsonb_build_object(
    'ok',true,'itemId',i.id,'party',p_party,'response',p_response,'status',v_status,
    'requiredCount',v_required,'confirmedCount',v_confirmed,'advanceRevision',a.revision_no
  );
end;
$$;

create or replace function public.ns_initialize_pre_show_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_count integer;
  v_show_advance_item uuid;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking must be secured before pre-show'; end if;
  if b.event_date is null then raise exception 'Booking event date is required'; end if;

  select * into a from public.booking_advances where booking_id=p_booking_id;
  if not found
     or a.status <> 'confirmed'
     or a.confirmed_revision_no is distinct from a.revision_no
     or a.confirmed_snapshot is null then
    raise exception 'Current Show Advance must be confirmed by buyer and talent before pre-show starts';
  end if;

  insert into public.pre_show_checklist_items(
    booking_id,checkpoint_code,item_key,label,due_date,required_parties,advance_revision_no,status,completed_at
  )
  values
    (b.id,'H-14','show_advance','Show Advance revision confirmed by buyer & talent',b.event_date-14,array['system']::text[],a.revision_no,'done',now()),
    (b.id,'H-14','venue_access','Venue address, access/loading & onsite PIC reconfirmed',b.event_date-14,array['buyer']::text[],a.revision_no,'pending',null),
    (b.id,'H-7','rider_final','Final rider / technical requirements reconfirmed',b.event_date-7,array['talent']::text[],a.revision_no,'pending',null),
    (b.id,'H-7','lineup_backline','Personnel, lineup & backline reconfirmed',b.event_date-7,array['talent']::text[],a.revision_no,'pending',null),
    (b.id,'H-3','logistics','Transport, accommodation & hospitality reconfirmed',b.event_date-3,array['buyer','talent']::text[],a.revision_no,'pending',null),
    (b.id,'H-3','payment_status','Buyer payment status reviewed against schedule',b.event_date-3,array['admin']::text[],a.revision_no,'pending',null),
    (b.id,'H-1','call_sheet','Load-in, call, soundcheck & show time reconfirmed',b.event_date-1,array['buyer','talent']::text[],a.revision_no,'pending',null),
    (b.id,'H-1','emergency_contacts','Onsite, talent & technical contacts reconfirmed',b.event_date-1,array['buyer','talent']::text[],a.revision_no,'pending',null)
  on conflict(booking_id,checkpoint_code,item_key)
  do update set
    label=excluded.label,
    due_date=excluded.due_date,
    required_parties=excluded.required_parties,
    advance_revision_no=excluded.advance_revision_no,
    status=case
      when public.pre_show_checklist_items.advance_revision_no is distinct from excluded.advance_revision_no then excluded.status
      else public.pre_show_checklist_items.status
    end,
    completed_at=case
      when public.pre_show_checklist_items.advance_revision_no is distinct from excluded.advance_revision_no then excluded.completed_at
      else public.pre_show_checklist_items.completed_at
    end,
    updated_at=now();

  select id into v_show_advance_item
  from public.pre_show_checklist_items
  where booking_id=b.id and item_key='show_advance'
  limit 1;

  insert into public.pre_show_task_confirmations(
    checklist_item_id,booking_id,party,response,note,advance_revision_no
  )
  values(v_show_advance_item,b.id,'system','done','Auto-confirmed from current Show Advance',a.revision_no)
  on conflict(checklist_item_id,party,advance_revision_no)
  do update set response='done',note=excluded.note,updated_at=now();

  update public.pre_show_checklist_items
  set status='done',completed_at=coalesce(completed_at,now()),updated_at=now()
  where id=v_show_advance_item;

  if b.status='secured' then
    update public.bookings
    set status='pre_show',pre_show_at=coalesce(pre_show_at,now()),updated_at=now()
    where id=b.id and status='secured';
    if not found then raise exception 'Pre-show transition lost a concurrent update'; end if;
  end if;

  select count(*)::integer into v_count
  from public.pre_show_checklist_items
  where booking_id=b.id;

  return jsonb_build_object('ok',true,'status','pre_show','checklistCount',v_count,'advanceRevision',a.revision_no);
end;
$$;

create or replace function public.ns_complete_show_v1(p_booking_id uuid)
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
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pre_show' then raise exception 'Pre-show checklist must be initialized before show completion'; end if;

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

  update public.bookings
  set status='completed',completed_at=v_completed,updated_at=v_completed
  where id=b.id and status='pre_show';
  if not found then raise exception 'Show completion lost a concurrent update'; end if;

  update public.briefs
  set status='closed',updated_at=v_completed
  where id=b.brief_id and status='booked';

  return jsonb_build_object('ok',true,'bookingStatus','completed','completedAt',v_completed);
end;
$$;

create or replace function public.ns_confirm_booking_advance_party_v2(
  p_booking_id uuid,
  p_party text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $
declare
  b public.bookings%rowtype;
  a public.booking_advances%rowtype;
  v_now timestamptz:=now();
  v_snapshot jsonb;
  v_ref text;
  v_show_advance_item uuid;
begin
  if p_party not in ('buyer','talent') then raise exception 'Invalid Show Advance party'; end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking is not eligible for Show Advance confirmation'; end if;

  select * into a from public.booking_advances where booking_id=b.id for update;
  if not found then raise exception 'Show Advance has not been started'; end if;
  if a.admin_reviewed_revision_no is distinct from a.revision_no or a.admin_reviewed_at is null then
    raise exception 'Current Show Advance revision has not passed admin review';
  end if;
  if p_party='buyer' and a.buyer_submission is null then raise exception 'Buyer/EO event details are missing'; end if;
  if p_party='talent' and a.talent_submission is null then raise exception 'Talent/manager details are missing'; end if;

  if a.status='confirmed' and a.confirmed_revision_no=a.revision_no then
    return jsonb_build_object('ok',true,'status','confirmed','revisionNo',a.revision_no,'alreadyConfirmed',true);
  end if;

  v_ref:=case when p_party='buyer' then 'signed_buyer_advance' else 'signed_talent_advance' end;

  if p_party='buyer' then
    if a.buyer_confirmed_at is not null then
      return jsonb_build_object('ok',true,'status',a.status,'revisionNo',a.revision_no,'alreadyConfirmed',true,'party','buyer');
    end if;
    update public.booking_advances
    set buyer_confirmed_at=v_now,buyer_confirmation_reference=v_ref,updated_at=v_now
    where booking_id=b.id returning * into a;
  else
    if a.talent_confirmed_at is not null then
      return jsonb_build_object('ok',true,'status',a.status,'revisionNo',a.revision_no,'alreadyConfirmed',true,'party','talent');
    end if;
    update public.booking_advances
    set talent_confirmed_at=v_now,talent_confirmation_reference=v_ref,updated_at=v_now
    where booking_id=b.id returning * into a;
  end if;

  insert into public.booking_advance_party_actions(booking_id,revision_no,party,action,source,payload_snapshot)
  values(b.id,a.revision_no,p_party,'confirmed','signed_link',null);

  if a.buyer_confirmed_at is not null and a.talent_confirmed_at is not null then
    v_snapshot:=jsonb_build_object(
      'schema_version',2,
      'booking_id',b.id,'brief_id',b.brief_id,'talent_id',b.talent_id,'event_date',b.event_date,
      'revision_no',a.revision_no,'event_timezone',a.event_timezone,
      'venue_name',a.venue_name,'venue_address',a.venue_address,
      'load_in_at_local',a.load_in_at_local,'call_at_local',a.call_at_local,'soundcheck_at_local',a.soundcheck_at_local,
      'show_start_at_local',a.show_start_at_local,'show_end_at_local',a.show_end_at_local,
      'performance_duration_minutes',a.performance_duration_minutes,
      'buyer_pic_name',a.buyer_pic_name,'buyer_pic_phone',a.buyer_pic_phone,
      'onsite_pic_name',a.onsite_pic_name,'onsite_pic_phone',a.onsite_pic_phone,
      'technical_pic_name',a.technical_pic_name,'technical_pic_phone',a.technical_pic_phone,
      'talent_pic_name',a.talent_pic_name,'talent_pic_phone',a.talent_pic_phone,
      'personnel_count',a.personnel_count,'lineup_notes',a.lineup_notes,'rider_version_id',a.rider_version_id,
      'transport_notes',a.transport_notes,'accommodation_notes',a.accommodation_notes,'hospitality_notes',a.hospitality_notes,
      'technical_notes',a.technical_notes,'backline_notes',a.backline_notes,'talent_operational_notes',a.talent_operational_notes,
      'access_loading_notes',a.access_loading_notes,'parking_notes',a.parking_notes,
      'buyer_confirmation_source','signed_link','talent_confirmation_source','signed_link','confirmed_at',v_now
    );

    update public.booking_advances
    set status='confirmed',confirmed_revision_no=revision_no,confirmed_snapshot=v_snapshot,confirmed_at=v_now,updated_at=v_now
    where booking_id=b.id returning * into a;

    insert into public.booking_advance_confirmations(
      booking_id,revision_no,snapshot,buyer_confirmation_reference,talent_confirmation_reference,confirmed_at
    ) values(b.id,a.revision_no,v_snapshot,'signed_buyer_advance','signed_talent_advance',v_now);

    if b.status='pre_show' then
      update public.pre_show_checklist_items
      set advance_revision_no=a.revision_no,
          status=case when item_key='show_advance' then 'done' else 'pending' end,
          completed_at=case when item_key='show_advance' then v_now else null end,
          updated_at=v_now
      where booking_id=b.id;

      select id into v_show_advance_item
      from public.pre_show_checklist_items
      where booking_id=b.id and item_key='show_advance'
      limit 1;

      if v_show_advance_item is not null then
        insert into public.pre_show_task_confirmations(
          checklist_item_id,booking_id,party,response,note,advance_revision_no
        )
        values(v_show_advance_item,b.id,'system','done','Auto-confirmed from revised Show Advance',a.revision_no)
        on conflict(checklist_item_id,party,advance_revision_no)
        do update set response='done',note=excluded.note,updated_at=v_now;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'status',a.status,'revisionNo',a.revision_no,'party',p_party,
    'buyerConfirmed',a.buyer_confirmed_at is not null,'talentConfirmed',a.talent_confirmed_at is not null,
    'confirmedAt',a.confirmed_at
  );
end;
$;

revoke all on function public.ns_set_pre_show_task_party_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ns_set_pre_show_task_party_v1(uuid,uuid,text,text,text) to service_role;
revoke all on function public.ns_initialize_pre_show_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_initialize_pre_show_v1(uuid) to service_role;
revoke all on function public.ns_confirm_booking_advance_party_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.ns_confirm_booking_advance_party_v2(uuid,text) to service_role;
revoke all on function public.ns_complete_show_v1(uuid) from public,anon,authenticated;
grant execute on function public.ns_complete_show_v1(uuid) to service_role;
