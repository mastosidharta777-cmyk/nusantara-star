-- Nusantara Star — Commercial Integrity Cutover Preflight V1
-- READ ONLY. Run before supabase-commercial-integrity-v1.sql.
-- Do not delete or repair anything from this script. Any returned row must be classified first.

-- 1) Existing buyer money marked PAID without usable external evidence.
select
  'paid_buyer_payment_missing_evidence' as issue,
  p.id as record_id,
  p.booking_id,
  p.payment_type,
  p.amount,
  p.provider,
  p.provider_reference,
  p.paid_at
from public.payments p
where p.status = 'paid'
  and coalesce(p.payment_type, '') like 'buyer_%'
  and (
    coalesce(trim(p.provider), '') = ''
    or coalesce(trim(p.provider_reference), '') = ''
  )
order by p.created_at;

-- 2) Legacy buyer acceptance. These timestamps are not automatically trusted as buyer consent
-- because the pre-cutover schema did not bind them to a signed buyer link + locked deal snapshot.
select
  'legacy_buyer_terms_acceptance' as issue,
  b.id as booking_id,
  b.brief_id,
  b.deal_id,
  b.status,
  b.buyer_terms_accepted_at
from public.bookings b
where b.buyer_terms_accepted_at is not null
order by b.buyer_terms_accepted_at;

-- 3) Confirmed talent offers without an explicit commercial validity deadline.
select
  'confirmed_offer_missing_expiry' as issue,
  o.id as offer_id,
  o.brief_id,
  o.talent_id,
  o.status,
  o.availability_status,
  o.quote_valid_until
from public.talent_offers o
where o.status = 'confirmed'
  and o.quote_valid_until is null;

-- 4) Buyer-visible proposal states without expiry.
select
  'active_proposal_missing_expiry' as issue,
  pr.id as proposal_id,
  pr.brief_id,
  pr.status,
  pr.expires_at
from public.proposals pr
where pr.status in ('sent', 'viewed', 'selected')
  and pr.expires_at is null;

-- 5) Confirmed proposal items without the offer-valid-until snapshot.
select
  'confirmed_proposal_item_missing_expiry' as issue,
  pi.id as proposal_item_id,
  pi.proposal_id,
  pi.brief_id,
  pi.talent_id,
  pi.availability_status,
  pi.offer_valid_until
from public.proposal_items pi
where pi.availability_status = 'confirmed'
  and pi.offer_valid_until is null;

-- Interpretation:
-- * Zero rows from all five queries = clean preflight for the new commercial-integrity rules.
-- * Any row = STOP. Determine whether it is QA/test debris or a real commercial record.
-- * Never fabricate payment evidence, buyer consent, availability, or expiry to make preflight pass.
