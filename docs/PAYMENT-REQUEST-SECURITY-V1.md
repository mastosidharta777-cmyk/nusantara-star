# Payment Request & Booking Security V1

Status: **LOCKED PRODUCT RULE**

## Agency workflow

The buyer does not receive a generic “pay now” amount. Every request is derived from the next buyer milestone already locked in the Deal Sheet.

Flow:

1. Buyer accepts the exact Buyer Terms snapshot.
2. Nusantara Star issues the next Payment Request.
3. The system resolves the milestone amount and due date automatically.
4. Admin sends the signed Payment Request link to the buyer.
5. Buyer transfers through the stated destination.
6. Payment remains pending until money is verified from the receiving bank/provider.
7. The verified payment atomically marks the related milestone paid.
8. For the initial security milestone, admin runs the final booking-security evaluation.
9. Only after that gate passes does the booking become **SECURED**.
10. Later buyer milestones may then be issued one by one.

## Payment Request snapshot

An issued request freezes:

- human-readable request reference;
- booking and locked deal;
- payment milestone;
- amount and currency;
- issue date and due date;
- event/talent buyer-facing snapshot;
- exact buyer terms snapshot already accepted;
- payment destination/instructions.

Issued request data is immutable. Payment status/evidence may change, but the commercial request itself cannot be silently edited.

## Payment instructions

V1 supports:

- bank transfer;
- payment link / virtual account;
- other explicitly named method.

Admin must provide the bank/provider and destination before issuing a request. Nusantara Star does not fabricate or default a destination.

## Verification rule

Buyer proof of transfer is not sufficient to mark a payment paid.

Paid status requires Nusantara Star/admin or a future licensed PSP integration to record actual provider/bank evidence and a transaction reference. The buyer-facing link is view-only.

## Initial booking security

There is no universal DP percentage.

The first contractual buyer milestone defines the cash security requirement unless an approved PO/credit or authorized commercial exception applies.

A selected talent or accepted terms alone do not create a secured booking.

## Subsequent milestones

After a booking is secured, later payment requests are issued sequentially. A later milestone is not issued while an earlier buyer payment request is still pending.

## Terminology

V1 calls this document **Payment Request**, not a tax invoice. Formal invoicing/tax-document integration can be added separately without changing the booking-security logic.
