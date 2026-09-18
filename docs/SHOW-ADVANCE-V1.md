# Show Advance / Booking Confirmation V1

Status: **SUPERSEDED / HISTORICAL**

Current rule: see `COLLABORATIVE-SHOW-ADVANCE-V2.md` and `PRE-SHOW-TASK-OWNERSHIP-V1.md`. V1 below is retained only as implementation history and must not be used as the current operating procedure.

## Purpose

The Deal Sheet is commercial. The Show Advance is operational.

Once a booking is secured, Nusantara Star needs one operational source of truth for the actual show: exact venue, local schedule, operational contacts, personnel, rider, technical requirements, logistics and hospitality.

## Lifecycle

1. Booking becomes **SECURED**.
2. Admin prepares the Show Advance from booking/brief/talent baseline data.
3. Venue, exact address, local event timezone, call time, show time, performance duration, onsite PIC, talent PIC and personnel count must be explicit.
4. An approved rider must be selected when the talent has an approved rider version.
5. Admin records actual buyer and talent/manager confirmation references.
6. The current revision becomes **CONFIRMED**.
7. Only a current confirmed revision can open the pre-show checklist.
8. Any edit creates a new revision, resets the current status to **DRAFT**, and requires reconfirmation.
9. While the current revision is unconfirmed, checklist updates and show completion are blocked.
10. Each confirmed revision is stored in append-only history.

## What confirmation means in V1

V1 confirmation is internal operational evidence, for example:

- buyer confirmation via WhatsApp/email/call reference;
- talent/manager confirmation via WhatsApp/email/call reference.

It is not a digital signature. A later version can replace these references with signed buyer/talent links without changing the revision model.

## Required confirmation fields

- final venue name;
- exact venue address;
- event timezone;
- call time;
- show start;
- performance duration;
- onsite PIC + phone;
- talent/manager operational PIC + phone;
- personnel count;
- final approved rider when an approved rider exists.

Load-in, soundcheck, show end, buyer PIC, technical PIC, transport, accommodation, hospitality, backline, access/loading and parking are supported and may be optional depending on the booking.

## Time handling

Operational date-times are stored as local venue wall-clock timestamps plus an explicit IANA event timezone.

For Indonesian events V1 exposes:

- WIB — Asia/Jakarta;
- WITA — Asia/Makassar;
- WIT — Asia/Jayapura.

This avoids silently converting a Bali or Papua show to Jakarta time.

## Pre-show checkpoints

The pre-show checklist is created only after Show Advance confirmation:

- H-14: Show Advance confirmation and venue/access/PIC;
- H-7: final rider/technical and lineup/backline;
- H-3: logistics and buyer payment status;
- H-1: call sheet and emergency contacts.

## Audit rule

A confirmed revision is never edited in place. Editing creates the next revision. Confirmation history is append-only so the team can see which operational facts were previously confirmed.
