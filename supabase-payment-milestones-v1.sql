-- Nusantara Star — Structured Payment Milestones V1
-- Stores payment schedules separately from actual payment transactions.

create table if not exists public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  party text not null check (party in ('buyer','talent')),
  milestone_type text not null check (milestone_type in ('booking_fee','deposit','balance','full_payment','other')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  calculation_type text not null check (calculation_type in ('percentage','fixed_amount','remaining_balance')),
  percentage numeric(5,2) null check (percentage is null or (percentage >= 0 and percentage <= 100)),
  amount bigint null check (amount is null or amount >= 0),
  due_basis text not null check (due_basis in ('booking_date','event_date','event_completion','invoice_date','custom_date')),
  due_offset_days integer not null default 0,
  custom_due_date date null,
  refundable boolean null,
  cancellation_note text null,
  status text not null default 'planned' check (status in ('planned','due','paid','waived','cancelled')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_milestones_value_check check (
    (calculation_type = 'percentage' and percentage is not null and amount is null)
    or (calculation_type = 'fixed_amount' and amount is not null and percentage is null)
    or (calculation_type = 'remaining_balance' and percentage is null and amount is null)
  ),
  constraint payment_milestones_custom_date_check check (
    (due_basis = 'custom_date' and custom_due_date is not null)
    or (due_basis <> 'custom_date' and custom_due_date is null)
  )
);

create unique index if not exists idx_payment_milestones_booking_party_sequence
  on public.payment_milestones(booking_id, party, sequence_no);

create index if not exists idx_payment_milestones_booking
  on public.payment_milestones(booking_id);

create index if not exists idx_payment_milestones_status
  on public.payment_milestones(status);

alter table public.payment_milestones enable row level security;

comment on table public.payment_milestones is
  'Structured buyer/talent payment schedule. Separate from actual transaction records in payments/settlements.';

comment on column public.payment_milestones.due_offset_days is
  'Relative to due_basis. Negative = before, positive = after. Example event_date + (-1) = H-1; event_completion + 30 = H+30.';

comment on column public.payment_milestones.refundable is
  'Whether this milestone is refundable when cancellation rules apply. Null means not yet specified.';
