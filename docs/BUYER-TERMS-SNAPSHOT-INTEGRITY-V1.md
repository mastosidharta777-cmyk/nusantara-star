# Buyer Terms Snapshot Integrity V1

Status: **LOCKED PRODUCT RULE**

## Agency rule

Buyer acceptance must apply to the exact commercial terms the buyer reviewed, not merely to a deal ID or a generic terms page.

When a locked deal is converted into a pending booking, Nusantara Star freezes a buyer-facing snapshot containing:

- selected talent and event identity;
- buyer price and buyer-facing price breakdown;
- buyer payment schedule;
- cancellation terms;
- rider / technical notes;
- special conditions;
- included / excluded cost notes;
- offer validity.

Talent payable and internal agency margin are intentionally excluded from the buyer-facing snapshot.

## Acceptance evidence

The signed buyer link accepts the exact `buyer_terms_snapshot`.

At acceptance the database copies that exact object into `buyer_terms_accepted_snapshot` and records:

- accepted timestamp;
- locked deal ID;
- acceptance source = `signed_buyer_link`.

After acceptance, the accepted snapshot and its evidence fields are immutable.

## Booking security gate

A booking cannot become secured unless:

1. the deal remains locked and commercially consistent with the booking;
2. the exact buyer terms snapshot was accepted;
3. the accepted snapshot still equals the booking snapshot;
4. payment schedule, cancellation, rider and special conditions still match the locked deal;
5. the talent offer is still confirmed and valid;
6. funding / financial security requirements are satisfied.

If the commercial deal changes after buyer acceptance, the booking must not silently continue under the old acceptance.

## Price breakdown fallback

If the selected proposal breakdown still exactly matches the locked Deal Sheet, the buyer sees the detailed breakdown.

If an approved commercial exception changes the locked deal so the old proposal breakdown no longer matches, the snapshot falls back to an aggregate buyer-facing structure:

- Talent Fee;
- Direct Operating Costs;
- Taxes / Payment Fees.

This prevents stale proposal components from being presented as if they were still exact.
