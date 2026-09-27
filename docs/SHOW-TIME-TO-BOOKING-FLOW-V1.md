# Show time through booking: flow and remaining gate

Status: staged after the buyer estimate change. This document describes the actual app boundary; it does not redefine the locked PRD.

| Stage | Source | Meaning / next gate |
| --- | --- | --- |
| Buyer brief | `briefs.estimated_show_*` | Optional proposed performance hours. No talent commitment. |
| Manager response | `talent_offers.show_*` via `ns_record_availability_response_v2` | Required for new confirmed offers. Named Indonesian time zone and local start/end; an earlier end means the next calendar day. The same transaction records the fee, offer validity and response. |
| Admin proposal | `proposal_items.show_*` | Copy from a still valid confirmed offer. This is a frozen buyer-facing performance window; an old offer without hours cannot produce a new proposal. |
| Buyer selection and deal | Selected `proposal_item_id` and `talent_offer_id` | Deal stays linked to the exact proposal and live offer. Reconfirm and issue a new proposal if the performance window changes. |
| Booking preparation | `bookings.buyer_terms_snapshot.event.show_*` | Verify the frozen proposal and current offer match, then show hours to buyer before signed acceptance. Accepted snapshots remain immutable. |
| Payment and security | Payment request / booking RPCs | **Still date-based for resource conflicts.** Do not describe the performance window as a time reservation or promise that a second same-day show is feasible. |
| Show advance | Advance schedule after secured booking | Operational call, soundcheck and travel hours are captured later; they cannot retroactively justify taking a deposit. |

## Required reservation follow-up before same-day concurrent booking

1. Define a manager-confirmed **full duty interval** with exact start/end instants and location, including the time needed around the show. The performance interval alone is insufficient. Overnight shows span dates. Keep buyer-facing performance hours and operational duty hours distinct.
2. Before requesting initial payment, require an admin review of travel and turnaround for any other talent engagement nearby in time, including tentative and already secured work. Record the decision and inputs. Multiple same-day shows can proceed only if duty intervals, travel and rest are feasible.
3. Reserve the duty interval for a pending-security booking in a database transaction. Serialize competing attempts for the same talent, reject overlapping active reservations, bind the hold to a booking and expiry, and define idempotent renewal and release on cancellation, timeout and failed payment. Already secured bookings retain their interval. Verify both the payment-request transaction and the secure-booking transition against the same reservation; route-only checks are insufficient.
4. Add a controlled cutover for existing pending/secured bookings and in-flight offers. Exercise concurrent requests, crossing midnight, different Indonesian zones, expiration, rescheduling, refunds/cancellation and retry behavior. Never introduce a unique `(talent_id,event_date)` booking constraint: it would also reject feasible shows at separate hours.

The availability calendar currently has one status per date; `available` means a manager replied to an inquiry, not that an entire day is reserved or open. Public discovery may use it as a signal, but contract and payment decisions require the interval and transaction gates above.
