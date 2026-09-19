-- Nusantara Star — Supply Profile AI Normalization V1
-- Preserves the registrant's original wording separately from the approved public-profile draft.

alter table public.talent_profile_submissions
  add column if not exists bio_source text null,
  add column if not exists bio_normalized_at timestamptz null;

-- Existing profiles keep their previous bio as the original source; no profile text is overwritten.
update public.talent_profile_submissions
set bio_source = bio
where bio_source is null and nullif(btrim(coalesce(bio, '')), '') is not null;

comment on column public.talent_profile_submissions.bio_source is
  'Registrant-provided source wording. Never publicly displayed without review.';
comment on column public.talent_profile_submissions.bio is
  'Registrant-approved public-profile draft. It may be AI-normalized but must remain editable before submission.';
comment on column public.talent_profile_submissions.bio_normalized_at is
  'Timestamp of the last AI normalization preview accepted into the draft.';
