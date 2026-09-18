# Post-Show Confirmation V1

Status: **CURRENT PRODUCT RULE**

## Purpose

A booking must not become `completed` solely because an admin clicks a button.

Buyer/EO and Talent/Manager each record their own factual view of the performance result through the existing signed operational workspace.

This confirmation is separate from:
- incident handling;
- cancellation/refund decisions;
- talent settlement;
- future ratings/reviews.

## Outcomes

Each party selects exactly one outcome for the current Show Advance revision:

- `performed_as_agreed` — tampil sesuai kesepakatan;
- `performed_with_issue` — tampil tetapi ada perbedaan/kendala;
- `not_performed` — tidak tampil.

A note is mandatory for the latter two outcomes.

## Timing gate

Post-show confirmation is server-gated until the scheduled performance has ended.

Expected end time is:
1. `show_end_at_local`, when supplied; otherwise
2. `show_start_at_local + performance_duration_minutes`.

The calculation uses the event timezone stored in the confirmed Show Advance.

Admin completion is subject to the same timing gate.

## Revision binding

Every party confirmation stores `advance_revision_no`.

Only confirmations matching the currently confirmed Show Advance revision count toward completion.

If Show Advance is revised, an older post-show confirmation is stale and does not satisfy the completion gate.

## Completion gate

Normal completion requires all of the following:

1. booking status is `pre_show`;
2. current Show Advance is confirmed;
3. scheduled performance end has passed;
4. all current pre-show tasks are complete;
5. no incident is open;
6. Buyer outcome for the current revision is `performed_as_agreed`;
7. Talent outcome for the current revision is `performed_as_agreed`.

When all are true, completion source is stored as `both_parties`.

## Admin override

If one or both party confirmations are missing or not `performed_as_agreed`, admin may complete only by entering a non-empty override reason after the other operational gates are satisfied.

The booking stores:
- `completion_source = admin_override`;
- `completion_notes`;
- `completion_advance_revision_no`;
- `completed_at`.

An override is an auditable operational decision. It does not alter a party's submitted confirmation and does not erase incident history.

## Payments

Post-show confirmation does not:
- create a payment;
- release a payment;
- calculate a refund;
- alter agreed payment milestones.

Talent settlement continues to follow locked deal terms, evidenced buyer cash, approved exception rules, and the existing settlement engine. Payments that are contractually due before event completion remain possible under those existing controls.

## Privacy

Buyer/EO and Talent/Manager can see and edit only their own post-show confirmation in the signed workspace.

Admin can see both party confirmations.

The party workspace does not expose the other party's post-show note.

## Reviews

Ratings, qualitative reviews, reliability scoring, and public testimonials are intentionally outside this V1.

They should be implemented only after factual show completion has been established.
