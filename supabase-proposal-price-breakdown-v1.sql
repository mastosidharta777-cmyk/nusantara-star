-- Nusantara Star — Proposal Price Breakdown V1
-- Buyer-facing event price composition. Internal talent net fee/margin remains private.

alter table public.proposal_items
  add column if not exists price_breakdown jsonb not null default '{}'::jsonb;

alter table public.proposal_items
  drop constraint if exists proposal_items_price_breakdown_object_check;

alter table public.proposal_items
  add constraint proposal_items_price_breakdown_object_check
  check (jsonb_typeof(price_breakdown) = 'object');

comment on column public.proposal_items.price_breakdown is
  'Frozen buyer-facing event price breakdown. Internal talent net fee/margin is not exposed here; buyer_price remains the total payable snapshot.';
