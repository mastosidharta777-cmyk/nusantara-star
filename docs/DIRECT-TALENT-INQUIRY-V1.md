# Nusantara Star — Direct Talent Inquiry V1

Status: **LOCKED PRODUCT RULE**

This document extends the Nusantara Star V1 PRD for buyers who already know the talent they want. It must remain consistent with the PRD source-of-truth chain and state architecture.

## Core distinction

Two buyer entry modes exist:

1. `discovery` — buyer needs help finding talent.
2. `direct_talent` — buyer explicitly requests one known talent from a Nusantara Star profile.

Direct Talent Inquiry is buyer intent at brief creation. It is **not** Buyer Selection, confirmed availability, a commercial offer, or a booking.

## Data model

A brief stores:

- `request_mode = discovery | direct_talent`
- `requested_talent_id` only for `direct_talent`

`requested_talent_id` must be validated server-side against the operational roster before persistence. An invalid supplied talent ID must be rejected, never silently downgraded to discovery.

`buyer_selections` remains reserved for the later stage where the buyer selects a frozen proposal item.

## Direct flow

```text
Buyer opens known talent profile
→ Cek Ketersediaan & Minta Penawaran
→ identity/contact + event brief + buyer budget
→ server validates requested talent
→ Direct Inquiry persisted
→ Admin reviews event details
→ Admin starts live confirmation for requested talent
→ availability_request (no fake match_result required)
→ Talent/manager confirms availability + event fee + terms + rider
→ talent_offer becomes commercial source of truth
→ System prepares proposal for that requested talent
→ Admin approves/sends proposal
→ Buyer selects proposal item
→ Deal review
→ financial security
→ secured booking
→ operations
→ settlement
```

## Matching and budget rules

Direct inquiry must not run generic matching as the primary process and must not eliminate the requested talent because of the buyer's budget range. Buyer budget is negotiation context, not a public talent price.

Discovery keeps Budget Matching V1:

- within buyer budget → primary eligible candidate;
- up to 10% above buyer maximum → stretch alternative only;
- materially above tolerance → hard block.

Internal indicative talent fee is never buyer-facing.

If a directly requested talent is unavailable or commercially unworkable, alternatives may be generated later as a fallback. Those alternatives remain recommendations and do not rewrite the original `requested_talent_id` intent.

## State/source-of-truth rules

- Direct request target → Brief (`requested_talent_id`)
- Live availability request → `availability_requests`
- Event-specific availability/fee/terms/rider → `talent_offers`
- Buyer-facing commercial snapshot → `proposal_items`
- Buyer choice after proposal → `buyer_selections`
- Final agreement → Deal
- Secured engagement → Booking

No stage may infer or overwrite a later commercial fact from an earlier generic profile default.

## Admin UX

Admin must see, without interpreting source text:

- request type: `Direct inquiry`;
- exact requested talent name;
- event details and buyer budget;
- live confirmation state;
- manager secure-link action;
- event-specific offer state/validity when confirmed.

For a direct inquiry with no fallback candidates, the UI must not display a misleading empty generic matching section.

## End-to-end change rule

Any future change affecting Direct Inquiry must be checked against:

`buyer UX → admin workflow → talent/manager workflow → database source of truth → state transitions → matching/AI → commercial data → proposal → deal → booking → operations/settlement → security/privacy`.

A local UI fix is not accepted if it creates a contradiction anywhere downstream.
