-- Additive cutover: deploy before the application code. Existing offers and proposals
-- stay readable; only new manager confirmations and proposals require a show window.
begin;

alter table public.talent_offers
  add column if not exists show_start_local time null,
  add column if not exists show_end_local time null,
  add column if not exists show_timezone text null;
alter table public.proposal_items
  add column if not exists show_start_local time null,
  add column if not exists show_end_local time null,
  add column if not exists show_timezone text null;

alter table public.talent_offers drop constraint if exists talent_offers_show_window_check;
alter table public.talent_offers add constraint talent_offers_show_window_check check (
  (show_start_local is null and show_end_local is null and show_timezone is null)
  or (show_start_local is not null and show_end_local is not null
    and show_start_local <> show_end_local
    and show_timezone in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura'))
);
alter table public.proposal_items drop constraint if exists proposal_items_show_window_check;
alter table public.proposal_items add constraint proposal_items_show_window_check check (
  (show_start_local is null and show_end_local is null and show_timezone is null)
  or (show_start_local is not null and show_end_local is not null
    and show_start_local <> show_end_local
    and show_timezone in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura'))
);

create or replace function public.ns_record_availability_response_v2(
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
  p_show_timezone text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
  v_brief public.briefs%rowtype;
begin
  if p_status = 'confirmed' then
    if p_show_start_local is null or p_show_end_local is null
       or p_show_start_local !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or p_show_end_local !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or p_show_start_local = p_show_end_local
       or p_show_timezone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')
       or p_show_timezone is null then
      raise exception 'Confirmed offer requires a valid show start, end and event time zone';
    end if;
    select b.* into v_brief from public.availability_requests r
      join public.briefs b on b.id = r.brief_id where r.id = p_request_id;
    if not found or v_brief.event_date is null then raise exception 'Event date is required'; end if;
    if v_brief.estimated_show_timezone is not null
       and v_brief.estimated_show_timezone <> p_show_timezone then
      raise exception 'Show time zone differs from buyer brief; reconcile the event time zone first';
    end if;
  end if;

  -- The V1 function performs the availability and commercial writes in this
  -- same transaction and locks the request and brief. Any error below rolls
  -- them all back. V1 remains callable for historical/internal workflows.
  v_result := public.ns_record_availability_response_v1(
    p_request_id,p_status,p_event_fee,p_included_costs,p_excluded_costs,
    p_payment_terms,p_rider_exceptions,p_quote_valid_until
  );
  if p_status <> 'no_response' then
    update public.talent_offers set
      show_start_local = case when p_status = 'confirmed' then p_show_start_local::time else null end,
      show_end_local = case when p_status = 'confirmed' then p_show_end_local::time else null end,
      show_timezone = case when p_status = 'confirmed' then p_show_timezone else null end
    where availability_request_id = p_request_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.ns_record_availability_response_v2(uuid,text,bigint,text,text,text,text,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.ns_record_availability_response_v2(uuid,text,bigint,text,text,text,text,timestamptz,text,text,text) to service_role;
comment on column public.talent_offers.show_start_local is 'Manager-confirmed performance start in the named event time zone; not a travel or full duty block.';
comment on column public.proposal_items.show_start_local is 'Frozen buyer-facing performance start from the confirmed offer.';
commit;
