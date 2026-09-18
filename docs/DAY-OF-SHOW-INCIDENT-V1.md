# Day-of-Show Incident & Evidence V1

Status: **CURRENT PRODUCT RULE**

## Purpose

Buyer/EO and Talent/Manager must be able to report operational facts during the event without turning Nusantara Star into the original data-entry owner.

Incident reports are observations, not automatic commercial or legal decisions.

## Access

The existing Buyer/EO and Talent/Manager operational secure links remain usable when a booking changes from pre_show to incident.

The link can:
- submit a new incident report;
- attach optional photo/PDF evidence up to 15 MB;
- attach an optional HTTP/HTTPS evidence link;
- view the operational incident history and evidence for the same booking.

The link cannot:
- resolve an incident;
- approve cancellation/refund/settlement;
- open replacement recovery automatically;
- edit checklist items while the booking is in incident status.

## Incident source

Every new incident records:
- reported_by_party: buyer, talent, admin, or system;
- report_source: signed_link, admin_portal, or system;
- occurred_at: server timestamp.

The report source remains visible in admin so an allegation/observation is not mistaken for an admin conclusion.

## Lifecycle

1. An active secured/pre_show booking can receive an incident.
2. Creating the incident moves the booking to incident.
3. While at least one incident remains open, party checklist updates are paused.
4. Admin reviews the report and any evidence.
5. Talent cancellation may enter the existing replacement recovery engine.
6. Cancellation/refund/settlement decisions remain in the existing admin commercial workflow.
7. Admin resolution requires a written resolution note.
8. When the last open incident is resolved, the booking restores to its prior secured/pre_show state.
9. Show completion remains blocked while any incident is open.

## Evidence

incident_evidence is private and service-role-only.

Supported direct uploads:
- JPEG
- PNG
- WebP
- PDF
- maximum 15 MB

Video is not directly uploaded in V1. Use an external evidence link instead.

Storage bucket incident-evidence is private. Download links are short-lived signed URLs generated server-side.

## Privacy

Buyer/Talent operational links can see incident status, source party, report text, and operational evidence for the booking.

Internal admin resolution notes are not exposed through Buyer/Talent operational links.

## Recovery integration

A talent_cancellation incident remains the trigger for the existing recovery engine. Recovery is not automatic; admin explicitly opens the recovery case after reviewing the incident.

No financial outcome is calculated from an incident report alone.
