-- Nusantara Star — Phase 3 Smart Proposal V1
-- Run after supabase-talent-offer-v1.sql.

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','sent','viewed','selected','revision_requested','expired')),
  expires_at timestamptz null,
  sent_at timestamptz null,
  viewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, version)
);

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete restrict,
  talent_offer_id uuid not null references public.talent_offers(id) on delete restrict,
  buyer_price bigint not null check (buyer_price >= 0),
  currency text not null default 'IDR',
  availability_status text not null,
  included_costs text null,
  excluded_costs text null,
  payment_terms text null,
  rider_exceptions text null,
  offer_valid_until timestamptz null,
  talent_name_snapshot text not null,
  talent_category_snapshot text not null,
  talent_base_city_snapshot text null,
  talent_genres_snapshot text[] not null default '{}',
  talent_bio_snapshot text null,
  talent_profile_image_url_snapshot text null,
  match_score_snapshot numeric(6,2) null,
  match_tier_snapshot text null,
  created_at timestamptz not null default now(),
  unique (proposal_id, talent_id)
);

create index if not exists idx_proposals_brief on public.proposals(brief_id, version desc);
create index if not exists idx_proposal_items_proposal on public.proposal_items(proposal_id);
create index if not exists idx_proposal_items_brief on public.proposal_items(brief_id);

alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;

comment on table public.proposals is 'Versioned buyer proposal snapshot. Buyer-facing content must come from proposal_items, not live talent profile pricing.';
comment on table public.proposal_items is 'Frozen buyer-facing snapshot sourced from a confirmed event-specific talent_offer plus approved matching metadata.';
comment on column public.proposal_items.buyer_price is 'Buyer-facing event price snapshot for this proposal version. V1 initializes from confirmed talent offer; later deal logic may introduce explicitly approved commercial adjustments.';
