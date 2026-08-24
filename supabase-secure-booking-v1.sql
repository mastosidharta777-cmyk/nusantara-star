-- Nusantara Star — Phase 5 Secure Booking V1
-- Run after supabase-deal-copilot-v1.sql.

alter table public.bookings
  add column if not exists deal_id uuid null references public.deals(id) on delete restrict,
  add column if not exists buyer_terms_accepted_at timestamptz null,
  add column if not exists financial_security_type text null,
  add column if not exists financial_security_status text not null default 'pending',
  add column if not exists financial_security_reference text null,
  add column if not exists secured_at timestamptz null,
  add column if not exists pre_show_at timestamptz null,
  add column if not exists completed_at timestamptz null;

update public.bookings set status = 'pending_security' where status = 'pending';
update public.bookings set status = 'secured' where status = 'confirmed';

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending_security','secured','pre_show','completed','cancelled'));

alter table public.bookings drop constraint if exists bookings_financial_security_type_check;
alter table public.bookings add constraint bookings_financial_security_type_check
  check (financial_security_type is null or financial_security_type in ('deposit_received','full_payment_received','approved_po_credit','authorized_exception'));

alter table public.bookings drop constraint if exists bookings_financial_security_status_check;
alter table public.bookings add constraint bookings_financial_security_status_check
  check (financial_security_status in ('pending','satisfied','rejected'));

create index if not exists idx_bookings_deal_id on public.bookings(deal_id);
create index if not exists idx_bookings_security_status on public.bookings(financial_security_status);

comment on column public.bookings.financial_security_type is 'Booking security condition actually used: received money, approved PO/credit, or authorized exception.';
comment on column public.bookings.buyer_terms_accepted_at is 'Explicit buyer terms acceptance evidence timestamp. Buyer Selected alone is not sufficient.';
comment on column public.bookings.secured_at is 'Timestamp when all booking-security requirements were satisfied.';
