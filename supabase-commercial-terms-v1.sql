create table if not exists public.commercial_terms (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null unique references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete restrict,
  buyer_price bigint not null check (buyer_price >= 0),
  talent_payable bigint not null check (talent_payable >= 0),
  direct_costs bigint not null default 0 check (direct_costs >= 0),
  taxes_and_payment_fees bigint not null default 0 check (taxes_and_payment_fees >= 0),
  payment_terms text,
  cancellation_terms text,
  notes text,
  status text not null default 'draft' check (status in ('draft','agreed')),
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_price >= talent_payable + direct_costs + taxes_and_payment_fees)
);

create index if not exists idx_commercial_terms_talent_id
  on public.commercial_terms(talent_id);

alter table public.commercial_terms enable row level security;

alter table public.briefs
  drop constraint if exists briefs_status_check;

alter table public.briefs
  add constraint briefs_status_check
  check (status in (
    'new',
    'reviewing',
    'matching',
    'availability_check',
    'shortlisted',
    'proposal_sent',
    'buyer_selected',
    'terms_agreed',
    'booked',
    'closed',
    'cancelled'
  ));
