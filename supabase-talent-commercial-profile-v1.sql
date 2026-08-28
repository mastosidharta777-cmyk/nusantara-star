-- Nusantara Star — Talent Commercial Profile V1
-- Separates reusable talent/management payment policy templates and curated buyer-facing media
-- from booking-specific payment milestones and from raw social/profile links.

create table if not exists public.talent_payment_policy_templates (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  milestone_type text not null check (milestone_type in ('booking_fee','deposit','balance','full_payment','other')),
  sequence_no integer not null default 1 check (sequence_no > 0),
  calculation_type text not null check (calculation_type in ('percentage','fixed_amount','remaining_balance')),
  percentage numeric(5,2) null check (percentage is null or (percentage >= 0 and percentage <= 100)),
  amount bigint null check (amount is null or amount >= 0),
  due_basis text not null check (due_basis in ('booking_date','event_date','event_completion','invoice_date')),
  due_offset_days integer not null default 0,
  refundable boolean null,
  cancellation_note text null,
  negotiable boolean not null default true,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_payment_policy_templates_value_check check (
    (calculation_type = 'percentage' and percentage is not null and amount is null)
    or (calculation_type = 'fixed_amount' and amount is not null and percentage is null)
    or (calculation_type = 'remaining_balance' and percentage is null and amount is null)
  )
);

create unique index if not exists idx_talent_payment_policy_templates_talent_sequence
  on public.talent_payment_policy_templates(talent_id, sequence_no)
  where is_active = true;

create index if not exists idx_talent_payment_policy_templates_talent
  on public.talent_payment_policy_templates(talent_id);

alter table public.talent_payment_policy_templates enable row level security;

comment on table public.talent_payment_policy_templates is
  'Reusable default payment policy defined by talent/management. Copied into booking payment milestones as a draft and may be overridden per booking when commercially agreed.';

comment on column public.talent_payment_policy_templates.negotiable is
  'Whether this policy step may be changed during booking negotiation. This is informational and does not by itself authorize a change.';

comment on column public.talent_payment_policy_templates.due_offset_days is
  'Relative to due_basis. Negative = before; positive = after.';

create table if not exists public.talent_media (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  media_type text not null check (media_type in ('live_performance','showreel','event_clip','other')),
  provider text not null check (provider in ('youtube_unlisted','internal_storage')),
  media_url text not null,
  title text null,
  description text null,
  buyer_visible boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 1 check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_media_talent
  on public.talent_media(talent_id);

create index if not exists idx_talent_media_buyer_visible
  on public.talent_media(talent_id, buyer_visible, is_active);

alter table public.talent_media enable row level security;

comment on table public.talent_media is
  'Curated Nusantara Star-controlled talent media for internal review and buyer proposals. Not a storage location for raw social contact/profile links.';

comment on column public.talent_media.buyer_visible is
  'True only after Nusantara Star has reviewed the media for buyer-facing use.';
