-- Nusantara Star — Data Integrity V1
-- Adds source/evidence metadata for AI-parsed briefs and versioning for persisted match snapshots.

alter table public.briefs
  add column if not exists source_text text,
  add column if not exists field_evidence jsonb not null default '{}'::jsonb;

comment on column public.briefs.source_text is
  'Original buyer/admin brief text used to create the structured brief. Kept as evidence source; not buyer-facing by default.';

comment on column public.briefs.field_evidence is
  'Per-field evidence metadata. Status values: explicit, normalized, inferred_review, missing. Exact excerpts are retained only when they can be verified against source_text.';

alter table public.match_results
  add column if not exists engine_version text,
  add column if not exists generated_at timestamptz;

create index if not exists idx_match_results_brief_generated
  on public.match_results(brief_id, generated_at);

comment on column public.match_results.engine_version is
  'Matching engine version that produced this persisted result. Non-null identifies a frozen generated matching snapshot rather than a legacy review-only row.';

comment on column public.match_results.generated_at is
  'Time this matching result snapshot was generated. Admin review changes must not silently regenerate or rewrite the score.';
