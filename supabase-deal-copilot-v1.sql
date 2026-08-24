-- Nusantara Star — Phase 4 Deal Copilot V1
-- Run after supabase-smart-proposal-v1.sql.

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null unique references public.briefs(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  proposal_item_id uuid not null references public.proposal_items(id) on delete restrict,
  talent_offer_id uuid not null references public.talent_offers(id) on delete restrict,
  talent_id uuid not null references public.talents(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','review_required','approved','locked')),
  buyer_price bigint not null check (buyer_price >= 0),
  talent_payable bigint not null check (talent_payable >= 0),
  direct_costs bigint null check (direct_costs is null or direct_costs >= 0),
  taxes_and_payment_fees bigint null check (taxes_and_payment_fees is null or taxes_and_payment_fees >= 0),
  contribution bigint null,
  buyer_payment_schedule jsonb not null default '[]'::jsonb,
  talent_payment_schedule jsonb not null default '[]'::jsonb,
  booking_reference_date date null,
  invoice_reference_date date null,
  direct_cost_due_date date null,
  tax_fee_due_date date null,
  funding_gap_amount bigint null check (funding_gap_amount is null or funding_gap_amount >= 0),
  funding_gap_status text not null default 'unknown' check (funding_gap_status in ('safe','gap','unknown')),
  talent_terms_status text not null default 'confirmed' check (talent_terms_status in ('confirmed','changed','unresolved')),
  buyer_terms_status text not null default 'recommended' check (buyer_terms_status in ('recommended','accepted','changed','unresolved')),
  unresolved_issues text[] not null default '{}',
  cancellation_terms text null,
  rider_notes text null,
  special_conditions text null,
  exception_status text not null default 'none' check (exception_status in ('none','requested','approved','rejected')),
  exception_reason text null,
  approved_at timestamptz null,
  locked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_status on public.deals(status);
create index if not exists idx_deals_talent on public.deals(talent_id);

alter table public.deals enable row level security;

comment on table public.deals is 'System-prepared event deal snapshot. Commercial facts are sourced from selected proposal/talent offer and explicit admin-entered deal details.';
comment on column public.deals.funding_gap_amount is 'Deterministic maximum negative cumulative cash position using persisted contractual dates only.';
comment on column public.deals.booking_reference_date is 'Persisted contractual booking reference date. Never substitute browser/current date.';
