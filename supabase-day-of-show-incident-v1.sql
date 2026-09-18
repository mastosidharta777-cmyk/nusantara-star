-- Nusantara Star — Day-of-Show Incident & Evidence V1
-- Production migration applied 2026-09-18.

alter table public.incidents
  add column if not exists reported_by_party text not null default 'admin',
  add column if not exists report_source text not null default 'admin_portal';

alter table public.incidents
  drop constraint if exists incidents_reported_by_party_check;
alter table public.incidents
  add constraint incidents_reported_by_party_check
  check (reported_by_party in ('buyer','talent','admin','system'));

alter table public.incidents
  drop constraint if exists incidents_report_source_check;
alter table public.incidents
  add constraint incidents_report_source_check
  check (report_source in ('signed_link','admin_portal','system'));

create table if not exists public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  uploaded_by_party text not null check (uploaded_by_party in ('buyer','talent','admin')),
  evidence_type text not null check (evidence_type in ('photo','document','link')),
  provider text not null check (provider in ('supabase_storage','external_url')),
  storage_key text null,
  external_url text null,
  original_filename text null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes > 0),
  upload_status text not null default 'uploaded' check (upload_status in ('pending_upload','uploaded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (provider='supabase_storage' and storage_key is not null and external_url is null)
    or
    (provider='external_url' and external_url is not null and storage_key is null)
  )
);

create index if not exists idx_incident_evidence_incident
  on public.incident_evidence(incident_id, created_at);
create index if not exists idx_incident_evidence_booking
  on public.incident_evidence(booking_id, created_at);

alter table public.incident_evidence enable row level security;
revoke all on table public.incident_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.incident_evidence to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'incident-evidence',
  'incident-evidence',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.ns_report_incident_v2(
  p_booking_id uuid,
  p_incident_type text,
  p_summary text,
  p_details text default null,
  p_reported_by_party text default 'admin',
  p_report_source text default 'admin_portal'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bookings%rowtype;
  i public.incidents%rowtype;
  v_prior text;
begin
  if p_incident_type not in (
    'buyer_cancellation','talent_cancellation','postponement','no_show','late_arrival',
    'shortened_performance','technical_failure','payment_dispute','force_majeure','other'
  ) then raise exception 'Invalid incident type'; end if;
  if coalesce(trim(p_summary),'')='' then raise exception 'Incident summary is required'; end if;
  if p_reported_by_party not in ('buyer','talent','admin','system') then raise exception 'Invalid incident reporter'; end if;
  if p_report_source not in ('signed_link','admin_portal','system') then raise exception 'Invalid incident report source'; end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','incident') then
    raise exception 'Booking is not in an operational state for incidents';
  end if;

  if b.status='incident' then
    select prior_booking_status into v_prior
    from public.incidents
    where booking_id=b.id and status='open'
    order by created_at asc
    limit 1;
    v_prior:=coalesce(v_prior,'pre_show');
  else
    v_prior:=b.status;
  end if;

  insert into public.incidents(
    booking_id,incident_type,summary,details,prior_booking_status,occurred_at,
    reported_by_party,report_source
  )
  values(
    b.id,p_incident_type,trim(p_summary),nullif(trim(coalesce(p_details,'')),''),
    v_prior,now(),p_reported_by_party,p_report_source
  )
  returning * into i;

  if b.status<>'incident' then
    update public.bookings
    set status='incident',updated_at=now()
    where id=b.id and status=b.status;
    if not found then raise exception 'Incident transition lost a concurrent update'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,'incidentId',i.id,'incidentStatus',i.status,'bookingStatus','incident',
    'reportedByParty',i.reported_by_party,'reportSource',i.report_source,'occurredAt',i.occurred_at
  );
end;
$$;

revoke all on function public.ns_report_incident_v2(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ns_report_incident_v2(uuid,text,text,text,text,text) to service_role;

create or replace function public.ns_resolve_incident_v1(
  p_booking_id uuid,
  p_incident_id uuid,
  p_resolution_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $
declare
  b public.bookings%rowtype;
  i public.incidents%rowtype;
  v_open integer;
  v_restore text;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  select * into i
  from public.incidents
  where id=p_incident_id and booking_id=b.id
  for update;
  if not found then raise exception 'Incident not found'; end if;
  if i.status<>'open' then raise exception 'Incident is already resolved'; end if;

  if exists (
    select 1
    from public.recovery_cases c
    where c.incident_id=i.id
      and c.status not in ('replacement_secured','closed_no_replacement','void')
  ) then
    raise exception 'Finish or close the active replacement recovery before resolving this incident';
  end if;

  update public.incidents
  set status='resolved',
      resolved_at=now(),
      resolution_notes=nullif(trim(coalesce(p_resolution_notes,'')),''),
      updated_at=now()
  where id=i.id and status='open';
  if not found then raise exception 'Incident resolution lost a concurrent update'; end if;

  select count(*)::integer into v_open
  from public.incidents
  where booking_id=b.id and status='open';

  if v_open=0 and b.status='incident' then
    v_restore:=case when i.prior_booking_status in ('secured','pre_show') then i.prior_booking_status else 'pre_show' end;
    update public.bookings
    set status=v_restore,updated_at=now()
    where id=b.id and status='incident';
    if not found then raise exception 'Incident restore lost a concurrent update'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'incidentStatus','resolved',
    'bookingStatus',case when v_open=0 and b.status='incident' then v_restore else b.status end
  );
end;
$;

revoke all on function public.ns_resolve_incident_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ns_resolve_incident_v1(uuid,uuid,text) to service_role;
