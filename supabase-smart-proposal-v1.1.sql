-- Nusantara Star — Phase 3 Smart Proposal V1.1
-- Add buyer-facing fit/media snapshots without exposing live/internal talent data.

alter table public.proposal_items
  add column if not exists why_fit_snapshot jsonb not null default '{"id":[],"en":[]}'::jsonb,
  add column if not exists media_snapshot jsonb not null default '[]'::jsonb;

comment on column public.proposal_items.why_fit_snapshot is
  'Frozen buyer-facing explanation of why this talent fits the brief. Must not expose internal reliability, margin, or private notes.';
comment on column public.proposal_items.media_snapshot is
  'Frozen metadata for admin-approved buyer-visible showreel/live media. URLs are generated at read time; signed URLs are not persisted.';
comment on column public.proposal_items.payment_terms is
  'Buyer-facing payment terms explicitly approved by admin for this proposal snapshot. Never copy talent payment terms automatically.';
