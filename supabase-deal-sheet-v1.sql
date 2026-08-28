alter table public.commercial_terms
  add column if not exists buyer_payment_schedule jsonb not null default '[]'::jsonb,
  add column if not exists talent_payment_schedule jsonb not null default '[]'::jsonb,
  add column if not exists rider_notes text,
  add column if not exists special_conditions text;

comment on column public.commercial_terms.buyer_payment_schedule is
  'Structured buyer payment milestones agreed for this specific deal. Snapshot; not a global policy.';

comment on column public.commercial_terms.talent_payment_schedule is
  'Structured talent payment milestones agreed for this specific deal. Initially derived from talent profile policy, then snapshotted/overridable per deal.';

comment on column public.commercial_terms.rider_notes is
  'Deal-specific rider, travel, accommodation, equipment, or direct expense notes.';

comment on column public.commercial_terms.special_conditions is
  'Deal-specific special conditions that override or supplement baseline terms.';
