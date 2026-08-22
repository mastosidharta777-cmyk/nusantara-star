-- Nusantara Star — Buyer vs Talent Payment Terms V1
-- Separates buyer collection terms from talent payout terms.

alter table public.commercial_terms
  add column if not exists buyer_payment_terms text,
  add column if not exists talent_payment_terms text;

-- Preserve existing agreed buyer terms from the legacy payment_terms column.
update public.commercial_terms
set buyer_payment_terms = payment_terms
where buyer_payment_terms is null
  and payment_terms is not null;

comment on column public.commercial_terms.buyer_payment_terms is
  'Payment terms agreed with the buyer/client. May include corporate/government post-event terms.';

comment on column public.commercial_terms.talent_payment_terms is
  'Payment terms agreed with the talent/management. Kept separate from buyer terms; Nusantara Star does not automatically bridge funding gaps.';
