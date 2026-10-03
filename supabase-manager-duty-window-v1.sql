-- Draft migration. Apply only during the coordinated reservation cutover.
-- Depends on supabase-confirmed-show-window-v1.sql and the direct-inquiry RPC.
begin;

alter table public.talent_offers
  add column if not exists duty_start_at timestamptz null,
  add column if not exists duty_end_at timestamptz null,
  add column if not exists duty_location text null;
alter table public.proposal_items
  add column if not exists duty_start_at timestamptz null,
  add column if not exists duty_end_at timestamptz null,
  add column if not exists duty_location text null;

alter table public.talent_offers drop constraint if exists talent_offers_duty_window_check;
alter table public.talent_offers add constraint talent_offers_duty_window_check check (
  (duty_start_at is null and duty_end_at is null and duty_location is null)
  or (duty_start_at is not null and duty_end_at is not null and duty_location is not null
    and duty_start_at < duty_end_at and length(trim(duty_location)) between 3 and 300)
);
alter table public.proposal_items drop constraint if exists proposal_items_duty_window_check;
alter table public.proposal_items add constraint proposal_items_duty_window_check check (
  (duty_start_at is null and duty_end_at is null and duty_location is null)
  or (duty_start_at is not null and duty_end_at is not null and duty_location is not null
    and duty_start_at < duty_end_at and length(trim(duty_location)) between 3 and 300)
);

create or replace function public.ns_record_availability_response_v3(
  p_request_id uuid,
  p_status text,
  p_event_fee bigint default null,
  p_included_costs text default null,
  p_excluded_costs text default null,
  p_payment_terms text default null,
  p_rider_exceptions text default null,
  p_quote_valid_until timestamptz default null,
  p_show_start_local text default null,
  p_show_end_local text default null,
  p_show_timezone text default null,
  p_duty_start_local text default null,
  p_duty_end_local text default null,
  p_duty_location text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_brief public.briefs%rowtype;
  v_duty_start timestamptz;
  v_duty_end timestamptz;
  v_show_start timestamptz;
  v_show_end timestamptz;
  v_result jsonb;
begin
  if p_status = 'confirmed' then
    if p_duty_start_local is null or p_duty_end_local is null
      or p_duty_start_local !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
      or p_duty_end_local !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
      or length(trim(coalesce(p_duty_location,''))) not between 3 and 300 then
      raise exception 'Confirmed offer requires duty start, end and event location';
    end if;
    if p_show_timezone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')
      or p_show_timezone is null then raise exception 'Invalid event time zone'; end if;

    select b.* into v_brief from public.availability_requests r
      join public.briefs b on b.id = r.brief_id where r.id = p_request_id;
    if not found or v_brief.event_date is null then raise exception 'Event date is required'; end if;

    v_duty_start := p_duty_start_local::timestamp at time zone p_show_timezone;
    v_duty_end := p_duty_end_local::timestamp at time zone p_show_timezone;
    v_show_start := (v_brief.event_date + p_show_start_local::time) at time zone p_show_timezone;
    v_show_end := (v_brief.event_date + p_show_end_local::time
      + case when p_show_end_local::time < p_show_start_local::time then interval '1 day' else interval '0 day' end)
      at time zone p_show_timezone;
    if v_duty_start >= v_duty_end or v_show_start < v_duty_start or v_show_end > v_duty_end then
      raise exception 'Duty interval must enclose the complete performance interval';
    end if;
  end if;

  -- V2 performs the availability, fee and performance writes in this same
  -- transaction. If the duty update fails, every preceding write rolls back.
  v_result := public.ns_record_availability_response_v2(
    p_request_id,p_status,p_event_fee,p_included_costs,p_excluded_costs,
    p_payment_terms,p_rider_exceptions,p_quote_valid_until,
    p_show_start_local,p_show_end_local,p_show_timezone
  );
  if p_status <> 'no_response' then
    update public.talent_offers set
      duty_start_at = case when p_status = 'confirmed' then v_duty_start else null end,
      duty_end_at = case when p_status = 'confirmed' then v_duty_end else null end,
      duty_location = case when p_status = 'confirmed' then trim(p_duty_location) else null end
    where availability_request_id = p_request_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.ns_record_availability_response_v3(uuid,text,bigint,text,text,text,text,timestamptz,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.ns_record_availability_response_v3(uuid,text,bigint,text,text,text,text,timestamptz,text,text,text,text,text,text) to service_role;
comment on column public.talent_offers.duty_start_at is 'Manager-confirmed UTC instant when talent duty starts for this event; private operational commitment.';
comment on column public.proposal_items.duty_start_at is 'Frozen private duty start from event-specific manager offer.';
commit;
