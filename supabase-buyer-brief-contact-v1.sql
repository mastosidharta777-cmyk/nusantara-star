-- Nusantara Star — Buyer Brief Contact V1
-- Run once before enabling the production buyer brief endpoint.
-- Buyer contact details are stored separately from AI source_text/evidence.

alter table public.briefs
  add column if not exists buyer_name text null,
  add column if not exists buyer_company text null,
  add column if not exists buyer_whatsapp text null,
  add column if not exists buyer_email text null;

comment on column public.briefs.buyer_name is
  'Buyer/client contact name supplied with the brief. Internal operational data; not talent-facing by default.';
comment on column public.briefs.buyer_company is
  'Buyer/client company or organization supplied with the brief.';
comment on column public.briefs.buyer_whatsapp is
  'Buyer/client WhatsApp supplied with the brief. Internal contact data.';
comment on column public.briefs.buyer_email is
  'Buyer/client email supplied with the brief. Internal contact data.';
