-- Nusantara Star — Phase 6 Operations V1
-- Run after supabase-operations-security-v1.1.sql.
-- Adds pre-show checklist, incident handling, and actual talent settlement records.

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending_security','secured','pre_show','incident','completed','cancelled'));

create table if not exists public.pre_show_checklist_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  checkpoint_code text not null check (checkpoint_code in ('H-14','H-7','H-3','H-1')),
  item_key text not null,
  label text not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','done','not_applicable')),
  notes text null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, checkpoint_code, item_key)
);

create index if not exists idx_pre_show_checklist_booking on public.pre_show_checklist_items(booking_id);
create index if not exists idx_pre_show_checklist_due on public.pre_show_checklist_items(due_date, status);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  incident_type text not null check (incident_type in (
    'buyer_cancellation','talent_cancellation','postponement','no_show','late_arrival',
    'shortened_performance','technical_failure','payment_dispute','force_majeure','other'
  )),
  summary text not null,
  details text null,
  status text not null default 'open' check (status in ('open','resolved')),
  prior_booking_status text null check (prior_booking_status is null or prior_booking_status in ('secured','pre_show','completed')),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolution_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidents_booking on public.incidents(booking_id);
create index if not exists idx_incidents_open on public.incidents(booking_id, status);

create table if not exists public.talent_settlements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount bigint not null check (amount > 0),
  currency text not null default 'IDR',
  provider text null,
  provider_reference text not null,
  idempotency_key text not null,
  status text not null default 'paid' check (status in ('paid','reversed')),
  paid_at timestamptz not null,
  reversed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists idx_talent_settlements_booking on public.talent_settlements(booking_id);
create index if not exists idx_talent_settlements_status on public.talent_settlements(booking_id, status);

alter table public.pre_show_checklist_items enable row level security;
alter table public.incidents enable row level security;
alter table public.talent_settlements enable row level security;

create or replace function public.ns_record_talent_settlement_v1(
  p_booking_id uuid,
  p_amount bigint,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns public.talent_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  existing public.talent_settlements%rowtype;
  paid_total bigint;
  result_row public.talent_settlements%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero';
  end if;
  if coalesce(trim(p_provider_reference), '') = '' then
    raise exception 'Settlement evidence/reference is required';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;

  select * into existing
  from public.talent_settlements
  where idempotency_key = p_idempotency_key;

  if found then
    if existing.booking_id <> p_booking_id or existing.amount <> p_amount then
      raise exception 'Idempotency key already used for a different settlement';
    end if;
    return existing;
  end if;

  select * into b
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if b.status not in ('secured','pre_show','completed') then
    raise exception 'Booking is not eligible for talent settlement';
  end if;
  if b.talent_payable is null or b.talent_payable <= 0 then
    raise exception 'Talent payable is invalid';
  end if;

  select coalesce(sum(amount), 0)::bigint into paid_total
  from public.talent_settlements
  where booking_id = p_booking_id and status = 'paid';

  if paid_total + p_amount > b.talent_payable then
    raise exception 'Settlement would exceed talent payable';
  end if;

  insert into public.talent_settlements (
    booking_id, amount, provider, provider_reference, idempotency_key, status, paid_at, notes
  ) values (
    p_booking_id, p_amount, nullif(trim(p_provider), ''), trim(p_provider_reference), trim(p_idempotency_key), 'paid', p_paid_at, p_notes
  )
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from public;
revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from anon;
revoke all on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) from authenticated;
grant execute on function public.ns_record_talent_settlement_v1(uuid,bigint,text,text,text,timestamptz,text) to service_role;

comment on table public.pre_show_checklist_items is 'Operational pre-show checklist generated from the secured booking event date.';
comment on table public.incidents is 'Operational problems recorded against a booking; separate from commercial and financial facts.';
comment on table public.talent_settlements is 'Actual money paid to talent. Planned obligations remain in payment_milestones.';
