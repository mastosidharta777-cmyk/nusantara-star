# Nusantara Star — Product Requirements Document V1.0

Status: **LOCKED FOR ARCHITECTURE**

This document is the source of truth for Nusantara Star V1. Product and engineering changes must be checked against it before implementation.

## 1. Product definition

Nusantara Star is a **Curated Talent & Entertainment Agency** supported by technology and AI.

It is not an open marketplace, event organizer, generic talent directory, or autonomous booking bot.

Core proposition:

> **Satu brief. Talent yang tepat.**

The product sells curation, speed, commercial coordination, booking certainty, and accountability.

## 2. Users

### Buyer
EO/event agencies, corporate, brand/activation agencies, hospitality, MICE, wedding/private events, and institutional buyers.

Buyer must not see talent net fee, Nusantara Star margin, manager contact, internal reliability data, or internal notes.

### Talent / Manager
Needs a fast inquiry flow: event details, availability, event-specific fee, payment terms, rider, and confirmation.

### Nusantara Star Admin
Admin makes decisions and handles exceptions. Admin must not become a database operator.

## 3. Golden flow

```text
Buyer Brief
→ AI understands brief
→ Admin quick review
→ Rule engine finds eligible candidates
→ Admin chooses candidates to contact
→ Availability + Offer Confirmation to talent/manager
→ Manager confirms availability + event fee + terms + rider
→ System builds buyer proposal
→ Admin approves proposal
→ Buyer receives 3–5 curated options
→ Buyer selects
→ Reconfirmation if offer/availability expired
→ Deal review
→ Buyer terms accepted
→ Financial security condition satisfied
→ Booking secured
→ Pre-show
→ Show
→ Completion / Incident
→ Settlement
```

## 4. Core operating principle

> **AI prepares → Rules verify/calculate → Human approves → System executes.**

AI must not create commercial or legal facts.

## 5. AI responsibilities

AI may:
- extract and normalize a buyer brief;
- identify missing or ambiguous information;
- summarize and explain matching;
- draft manager/buyer communications;
- parse manager replies into structured draft data;
- compare profile policy with event-specific changes;
- draft proposal copy;
- recommend payment structures subject to deterministic validation;
- flag commercial risks.

AI must not:
- invent availability, fee, rider, date, venue, duration, or payment terms;
- silently change talent policy;
- approve financial exceptions;
- autonomously send/accept a financial counteroffer;
- mark money paid without transaction evidence;
- create final legal commitments without human approval;
- expose internal margin/talent payable to buyers.

## 6. Brief evidence model

Do not use pseudo-precise AI confidence percentages as truth.

Each structured field uses one of:
- `explicit` — directly stated in source;
- `normalized` — same fact, normalized for date/currency/category format;
- `inferred_review` — interpretation required; human review needed;
- `missing` — source does not provide the fact.

Where AI claims evidence, the system stores a short exact source excerpt and verifies that excerpt exists in the original source text. Unsupported evidence is downgraded to `inferred_review`.

Never invent a missing year or other critical booking fact.

## 7. Matching

### Eligibility first
A candidate must pass hard eligibility rules before ranking:
- compatible talent category;
- not booked/unavailable for the event date;
- workable geography/logistics;
- mandatory requirements compatible.

### Ranking second
Ranking supports curation but does not create availability or commercial facts.

Availability lifecycle is:

`UNVERIFIED → LIVE CHECK → CONFIRMED`

No talent may appear as confirmed to a buyer solely because a calendar entry exists.

### Snapshot rule
A generated matching result must be persisted and versioned. Opening an admin page must not silently recalculate and change a prior recommendation.

## 8. Talent commercial profile

Talent/manager profile stores reusable defaults:
- identity and category;
- base city/service area;
- genres and formats;
- event fit;
- fee guidance;
- payment policy;
- cancellation baseline;
- travel/equipment/accommodation/overtime policy;
- curated media/showreel;
- availability calendar;
- operational history.

Profile policy is a **default**, not the final event agreement.

## 9. Talent Offer

Every contacted candidate should produce an event-specific `talent_offer` snapshot containing:
- brief/talent identifiers;
- availability status;
- confirmed event fee;
- included/excluded costs;
- payment terms;
- rider exceptions;
- quote validity;
- confirmation source and timestamp.

This becomes the commercial source for the proposal.

## 10. Buyer proposal

Proposal must use event-specific data, not a generic talent rate range as the booking price.

Buyer sees:
- talent identity/profile;
- curated showreel;
- why the talent fits;
- confirmed availability status;
- event-specific buyer price;
- included scope;
- key buyer-facing terms;
- validity/expiry when applicable.

Buyer selects a proposal item, not a live mutable talent database row.

## 11. Deal review

The normal admin view is a system-prepared summary, for example:

```text
Talent status      CONFIRMED
Talent fee         Rp9.000.000
Buyer price        Rp10.000.000
Contribution       Rp1.000.000
Talent terms       Confirmed
Buyer terms        Recommended
Funding gap        AMAN
Unresolved         Cancellation term confirmation
```

Admin chooses **Approve** or **Review Exception**.

The detailed milestone editor remains available only as **Advanced Deal Details**.

## 12. Payments

No universal deposit percentage or universal settlement timing.

Buyer and talent obligations are separate.

- Talent profile policy → reusable default.
- Talent offer → event-specific confirmed snapshot.
- Deal → final buyer/talent schedules.
- Booking → immutable payment milestone snapshot.
- Payment transaction → actual buyer money received.
- Talent settlement → actual money paid to talent.

Payment schedule and payment transaction are different concepts and must remain separate.

## 13. Funding gap

Funding gap is deterministic, not AI-generated.

At each contractual due date:

`cumulative buyer receipts - cumulative talent/direct obligations`

If the cash position becomes negative, the system flags the maximum funding gap.

A booking with an unresolved funding gap cannot silently proceed as normal.

Possible resolution:
- negotiate earlier buyer payment;
- negotiate talent terms;
- authorized company advance;
- approved external financing;
- decline/not secure the booking.

The system must use persisted contractual dates, never the browser's current date as a substitute for booking date.

## 14. Booking security

`Buyer Selected` is not `Booked`.

A booking is `SECURED` only when:
1. talent/event terms are valid;
2. buyer terms are accepted;
3. contract/booking acceptance requirements are satisfied; and
4. a valid financial security condition exists.

Financial security can be:
- required deposit received;
- full payment received;
- approved PO/corporate credit;
- authorized commercial exception.

Corporate/government post-event terms are supported, but funding exposure must be explicit.

## 15. State architecture

Do not use one global `brief.status` as the complete workflow state.

Target state machines:

### Brief
`new → needs_clarification → ready → matching → proposal_ready → closed`

### Talent Offer
`identified → request_sent → confirmed / changed / unavailable / expired`

### Proposal
`draft → sent → viewed → selected / revision_requested / expired`

### Deal
`draft → review_required → approved → locked`

### Booking
`pending_security → secured → pre_show → completed`

Exceptions: `cancelled`, `incident`.

### Payment
`planned → due → paid`, with `overdue`, `waived`, `cancelled` exceptions.

Until this split is implemented, legacy `brief.status` updates are forward-only and asynchronous responses must never regress the workflow.

## 16. Reliability

Reliability is based on real operational data, not AI opinion:
- response time;
- confirmed/completed bookings;
- cancellations/no-shows;
- late arrival;
- incidents;
- repeat bookings;
- buyer feedback.

New talent should be represented as `NEW / INSUFFICIENT DATA`, not assigned an invented low score.

## 17. Pre-show and incident handling

Secured bookings generate a simple pre-show checklist (H-14/H-7/H-3/H-1 as appropriate) for venue, PICs, call time, performance time, rider, technical requirements, transport/accommodation, and payment status.

Incident types include buyer/talent cancellation, postponement, no-show, late arrival, shortened performance, technical failure, payment dispute, force majeure, and other.

## 18. Source-of-truth chain

| Data | Source of truth |
|---|---|
| Default talent terms | Talent Profile |
| Event availability/fee/terms | Talent Offer |
| Buyer-facing price/scope | Proposal Item |
| Buyer choice | Buyer Selection |
| Final commercial agreement | Deal |
| Secured engagement | Booking |
| Planned payment | Payment Milestone |
| Actual buyer money | Payment Transaction |
| Actual talent payout | Talent Settlement |
| Operational problem | Incident |

Snapshot chain:

`Profile → Talent Offer → Proposal Item → Deal → Booking`

Later profile changes must not rewrite prior transaction snapshots.

## 19. MVP screens

### Buyer
1. Homepage
2. Talent discovery
3. Submit Brief
4. Brief clarification
5. Secure Proposal
6. Deal/terms summary
7. Booking confirmation

### Talent / Manager
1. Secure inquiry
2. Confirm/change offer
3. Booking confirmation

### Internal
1. Operations Inbox
2. Brief Detail
3. Talent Detail
4. Proposal Preview
5. Deal Review
6. Booking Detail
7. Payments/Settlement
8. Incident

## 20. Explicitly out of scope for V1

- mobile app;
- complex buyer dashboard;
- complex talent dashboard;
- open marketplace;
- autonomous negotiation;
- instant autonomous booking;
- public rating engine;
- ticketing;
- subscription;
- automated talent payout;
- homemade escrow;
- complex CRM.

## 21. Security requirements before production

- admin authentication;
- role-based authorization;
- signed expiring buyer links;
- signed expiring talent/manager links;
- Supabase service role server-only;
- audit log;
- idempotent financial writes;
- transactional/RPC handling for critical multi-write operations;
- no internal margin/net fee leakage to buyer;
- no manager contact leakage through buyer-facing surfaces;
- preview/internal mutation routes must not remain unauthenticated in production.

## 22. V1 product targets

Internal targets, not market claims:
- standard brief admin review: under 2 minutes;
- manager confirmation interaction: under 1 minute;
- proposal generation after confirmed offers: under 1 minute;
- standard booking admin data entry: under 5 minutes total;
- standard Deal Sheet manual fields: 0–3;
- critical AI facts without evidence/source: 0;
- proposals containing unconfirmed talent: 0;
- bookings with unresolved funding gaps: 0.

## 23. Build order

### Phase 1 — Data Integrity
Complete brief persistence, evidence metadata, frozen matching snapshots, forward-only legacy status guards, schedule validation.

### Phase 2 — Talent Offer
Availability + fee + payment terms + rider confirmation in one manager interaction.

### Phase 3 — Smart Proposal
Confirmed Talent Offer → event-specific buyer proposal snapshot.

### Phase 4 — Deal Copilot
System-prepared deal review; technical editors become exception/advanced UI.

### Phase 5 — Secure Booking
Terms + financial security condition → secured booking.

### Phase 6 — Operations
Pre-show, completion, settlement, incidents, production security/auth.
