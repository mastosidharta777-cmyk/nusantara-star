-- Nusantara Star — Direct Talent Inquiry V1
-- Run once after the existing V1 migrations.
-- Separates buyer intent (direct talent request vs discovery) from later Buyer Selection.

alter table public.briefs
  add column if not exists request_mode text not null default 'discovery',
  add column if not exists requested_talent_id uuid null references public.talents(id) on delete restrict;

alter table public.briefs
  drop constraint if exists briefs_request_mode_check,
  drop constraint if exists briefs_request_mode_target_check;

alter table public.briefs
  add constraint briefs_request_mode_check
    check (request_mode in ('discovery','direct_talent')),
  add constraint briefs_request_mode_target_check
    check (
      (request_mode = 'discovery' and requested_talent_id is null)
      or
      (request_mode = 'direct_talent' and requested_talent_id is not null)
    );

create index if not exists idx_briefs_requested_talent_id
  on public.briefs(requested_talent_id)
  where requested_talent_id is not null;

comment on column public.briefs.request_mode is
  'Buyer intent at brief creation: discovery searches for eligible talent; direct_talent requests a specific server-validated talent.';
comment on column public.briefs.requested_talent_id is
  'Specific talent explicitly requested by the buyer before proposal. This is not Buyer Selection and does not mean availability or booking.';

-- Direct inquiry confirmation must be able to advance to proposal readiness without inventing a match result.
-- Discovery flow still requires an approved match before shortlist.
create or replace function public.ns_record_availability_response_v1(
  p_request_id uuid,
  p_status text,
  p_event_fee bigint default null,
  p_included_costs text default null,
  p_excluded_costs text default null,
  p_payment_terms text default null,
  p_rider_exceptions text default null,
  p_quote_valid_until timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.availability_requests%rowtype;
  v_brief public.briefs%rowtype;
  v_match public.match_results%rowtype;
  v_offer_status text;
  v_calendar_status text;
  v_next_brief_status text;
  v_now timestamptz := now();
begin
  if p_status not in ('confirmed','tentative','unavailable','no_response') then raise exception 'Invalid response status'; end if;
  if p_event_fee is not null and p_event_fee < 0 then raise exception 'Invalid event fee'; end if;
  if p_status = 'confirmed' and coalesce(p_event_fee,0) <= 0 then raise exception 'Confirmed offer requires an event fee'; end if;
  if p_quote_valid_until is not null and p_quote_valid_until <= v_now then raise exception 'Quote validity must be in the future'; end if;

  select * into v_request from public.availability_requests where id = p_request_id for update;
  if not found then raise exception 'Availability request not found'; end if;

  select * into v_brief from public.briefs where id = v_request.brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if v_brief.status not in ('availability_check','shortlisted') then
    raise exception 'This offer can no longer be changed from the talent link';
  end if;

  if v_brief.request_mode = 'direct_talent' and v_brief.requested_talent_id <> v_request.talent_id then
    raise exception 'Availability request does not match the direct talent inquiry';
  end if;

  if v_brief.event_date is not null and p_status <> 'no_response' then
    v_calendar_status := case when p_status = 'confirmed' then 'available' else p_status end;
    insert into public.talent_availability (talent_id,event_date,status,notes,updated_at)
    values (v_request.talent_id,v_brief.event_date,v_calendar_status,'Live confirmation response for brief ' || v_request.brief_id::text,v_now)
    on conflict (talent_id,event_date) do update
      set status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at;
    update public.talents set last_calendar_updated_at = v_now, updated_at = v_now where id = v_request.talent_id;
  end if;

  update public.availability_requests set status = p_status, responded_at = v_now, updated_at = v_now where id = p_request_id;

  if p_status = 'no_response' then
    update public.talent_offers
      set status = 'expired', updated_at = v_now
      where availability_request_id = p_request_id and status <> 'expired';
  else
    v_offer_status := case
      when p_status = 'confirmed' then 'confirmed'
      when p_status = 'unavailable' then 'unavailable'
      else 'changed'
    end;
    insert into public.talent_offers (
      availability_request_id,brief_id,talent_id,status,availability_status,event_fee,currency,
      included_costs,excluded_costs,payment_terms,rider_exceptions,quote_valid_until,
      confirmation_source,confirmed_at,updated_at
    ) values (
      p_request_id,v_request.brief_id,v_request.talent_id,v_offer_status,p_status,
      case when p_status='unavailable' then null else p_event_fee end,'IDR',
      p_included_costs,p_excluded_costs,p_payment_terms,p_rider_exceptions,
      case when p_status='unavailable' then null else p_quote_valid_until end,
      'manager_portal',v_now,v_now
    ) on conflict (availability_request_id) do update set
      status = excluded.status,
      availability_status = excluded.availability_status,
      event_fee = excluded.event_fee,
      currency = excluded.currency,
      included_costs = excluded.included_costs,
      excluded_costs = excluded.excluded_costs,
      payment_terms = excluded.payment_terms,
      rider_exceptions = excluded.rider_exceptions,
      quote_valid_until = excluded.quote_valid_until,
      confirmation_source = excluded.confirmation_source,
      confirmed_at = excluded.confirmed_at,
      updated_at = excluded.updated_at;
  end if;

  v_next_brief_status := v_brief.status;
  if p_status = 'confirmed' and v_brief.status = 'availability_check' then
    if v_brief.request_mode = 'direct_talent' and v_brief.requested_talent_id = v_request.talent_id then
      v_next_brief_status := 'shortlisted';
      update public.briefs set status = 'shortlisted', updated_at = v_now where id = v_request.brief_id;
    else
      select * into v_match from public.match_results
      where brief_id = v_request.brief_id and talent_id = v_request.talent_id;
      if found and v_match.admin_approved = true and v_match.admin_rejected <> true then
        v_next_brief_status := 'shortlisted';
        update public.briefs set status = 'shortlisted', updated_at = v_now where id = v_request.brief_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'requestId', p_request_id,
    'briefId', v_request.brief_id,
    'talentId', v_request.talent_id,
    'status', p_status,
    'talentOffer', p_status <> 'no_response',
    'briefStatus', v_next_brief_status
  );
end;
$$;

revoke all on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) to service_role;

comment on function public.ns_record_availability_response_v1(uuid,text,bigint,text,text,text,text,timestamptz) is
  'Atomic talent availability/offer response. Direct inquiries can advance to proposal readiness after the explicitly requested talent is confirmed; discovery still requires approved matching.';
