-- Nusantara Star — Phase 6 atomic operations V1.1
-- Run after supabase-operations-v1.sql and the latest security patches.
-- Moves critical pre-show / incident / completion state transitions into database transactions.

create or replace function public.ns_initialize_pre_show_v1(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_count integer;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking must be secured before pre-show'; end if;
  if b.event_date is null then raise exception 'Booking event date is required'; end if;

  insert into public.pre_show_checklist_items (booking_id, checkpoint_code, item_key, label, due_date)
  values
    (b.id,'H-14','venue_pic','Venue & PIC confirmed',b.event_date - 14),
    (b.id,'H-14','event_contacts','Buyer/talent operational contacts confirmed',b.event_date - 14),
    (b.id,'H-7','rider','Rider requirements confirmed',b.event_date - 7),
    (b.id,'H-7','technical','Technical requirements confirmed',b.event_date - 7),
    (b.id,'H-3','transport_accommodation','Transport/accommodation confirmed',b.event_date - 3),
    (b.id,'H-3','payment_status','Payment status reviewed',b.event_date - 3),
    (b.id,'H-1','call_time','Call time confirmed',b.event_date - 1),
    (b.id,'H-1','performance_time','Performance time confirmed',b.event_date - 1)
  on conflict (booking_id, checkpoint_code, item_key) do nothing;

  if b.status = 'secured' then
    update public.bookings
    set status = 'pre_show', pre_show_at = coalesce(pre_show_at, now()), updated_at = now()
    where id = b.id and status = 'secured';
    if not found then raise exception 'Pre-show transition lost a concurrent update'; end if;
  end if;

  select count(*)::integer into v_count from public.pre_show_checklist_items where booking_id = b.id;
  return jsonb_build_object('ok', true, 'status', 'pre_show', 'checklistCount', v_count);
end;
$$;

create or replace function public.ns_report_incident_v1(
  p_booking_id uuid,
  p_incident_type text,
  p_summary text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  i public.incidents%rowtype;
  v_prior text;
begin
  if p_incident_type not in ('buyer_cancellation','talent_cancellation','postponement','no_show','late_arrival','shortened_performance','technical_failure','payment_dispute','force_majeure','other') then
    raise exception 'Invalid incident type';
  end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'Incident summary is required'; end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','incident') then raise exception 'Booking is not in an operational state for incidents'; end if;

  if b.status = 'incident' then
    select prior_booking_status into v_prior
    from public.incidents
    where booking_id = b.id and status = 'open'
    order by created_at asc
    limit 1;
    v_prior := coalesce(v_prior, 'pre_show');
  else
    v_prior := b.status;
  end if;

  insert into public.incidents (booking_id, incident_type, summary, details, prior_booking_status, occurred_at)
  values (b.id, p_incident_type, trim(p_summary), nullif(trim(coalesce(p_details,'')), ''), v_prior, now())
  returning * into i;

  if b.status <> 'incident' then
    update public.bookings set status = 'incident', updated_at = now()
    where id = b.id and status = b.status;
    if not found then raise exception 'Incident transition lost a concurrent update'; end if;
  end if;

  return jsonb_build_object('ok', true, 'incidentId', i.id, 'incidentStatus', i.status, 'bookingStatus', 'incident');
end;
$$;

create or replace function public.ns_resolve_incident_v1(
  p_booking_id uuid,
  p_incident_id uuid,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  i public.incidents%rowtype;
  v_open integer;
  v_restore text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  select * into i from public.incidents
  where id = p_incident_id and booking_id = b.id
  for update;
  if not found then raise exception 'Incident not found'; end if;
  if i.status <> 'open' then raise exception 'Incident is already resolved'; end if;

  update public.incidents
  set status = 'resolved', resolved_at = now(), resolution_notes = nullif(trim(coalesce(p_resolution_notes,'')), ''), updated_at = now()
  where id = i.id and status = 'open';
  if not found then raise exception 'Incident resolution lost a concurrent update'; end if;

  select count(*)::integer into v_open from public.incidents where booking_id = b.id and status = 'open';
  if v_open = 0 and b.status = 'incident' then
    v_restore := case when i.prior_booking_status in ('secured','pre_show') then i.prior_booking_status else 'pre_show' end;
    update public.bookings set status = v_restore, updated_at = now() where id = b.id and status = 'incident';
    if not found then raise exception 'Incident restore lost a concurrent update'; end if;
  end if;

  return jsonb_build_object('ok', true, 'incidentStatus', 'resolved', 'bookingStatus', case when v_open = 0 and b.status = 'incident' then v_restore else b.status end);
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
  v_open integer;
  v_completed timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show') then raise exception 'Booking is not ready for completion'; end if;

  select count(*)::integer into v_open from public.incidents where booking_id = b.id and status = 'open';
  if v_open > 0 then raise exception 'Resolve open incidents before completing the show'; end if;

  update public.bookings
  set status = 'completed', completed_at = v_completed, updated_at = v_completed
  where id = b.id and status in ('secured','pre_show');
  if not found then raise exception 'Show completion lost a concurrent update'; end if;

  update public.briefs set status = 'closed', updated_at = v_completed
  where id = b.brief_id and status = 'booked';

  return jsonb_build_object('ok', true, 'bookingStatus', 'completed', 'completedAt', v_completed);
end;
$$;

revoke all on function public.ns_initialize_pre_show_v1(uuid) from public, anon, authenticated;
revoke all on function public.ns_report_incident_v1(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.ns_resolve_incident_v1(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.ns_complete_show_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_initialize_pre_show_v1(uuid) to service_role;
grant execute on function public.ns_report_incident_v1(uuid,text,text,text) to service_role;
grant execute on function public.ns_resolve_incident_v1(uuid,uuid,text) to service_role;
grant execute on function public.ns_complete_show_v1(uuid) to service_role;

comment on function public.ns_initialize_pre_show_v1(uuid) is 'Atomic secured -> pre_show transition plus idempotent checklist initialization.';
comment on function public.ns_report_incident_v1(uuid,text,text,text) is 'Atomic incident record plus booking incident-state transition.';
comment on function public.ns_resolve_incident_v1(uuid,uuid,text) is 'Atomic incident resolution plus safe booking-state restoration when the last open incident closes.';
comment on function public.ns_complete_show_v1(uuid) is 'Atomic show completion; blocks open incidents and closes the legacy brief state.';
