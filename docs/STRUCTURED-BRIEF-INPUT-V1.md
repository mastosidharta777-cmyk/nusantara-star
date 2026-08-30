# Nusantara Star — Structured Brief Input V1

Status: **LOCKED PRODUCT / DATA RULE**

This document extends `PRD-NUSANTARA-STAR-V1.md` for the public structured brief form.

## Core rule

When the buyer submits a structured form, explicit form values are source-of-truth facts. AI may enrich unstructured notes and style signals, but AI must not overwrite explicit date, event type, city, venue, audience size, talent category, buyer budget band, selected performance format, or selected duration band.

Flow:

`structured form → deterministic validation/normalization → optional AI enrichment → explicit fields overwrite AI output → deterministic matching / direct-inquiry routing → persisted snapshot`.

## Budget bands

The public budget bands are buyer affordability context:

- `< Rp10 jt` → maximum Rp10,000,000;
- `Rp10–25 jt` → context range Rp10,000,000–Rp25,000,000, with Rp25,000,000 as affordability ceiling;
- `Rp25–50 jt` → context range Rp25,000,000–Rp50,000,000, with Rp50,000,000 as affordability ceiling;
- `Rp50–100 jt` → context range Rp50,000,000–Rp100,000,000, with Rp100,000,000 as affordability ceiling;
- `Rp100 jt+` → no explicit maximum ceiling.

The lower edge of a buyer budget band is **not** a minimum acceptable talent fee. A cheaper eligible talent must not be penalized merely for being below the lower edge of the selected band.

Discovery Budget Matching V1:

- talent indicative minimum at or below buyer maximum → within budget;
- talent indicative minimum up to 10% above buyer maximum → stretch alternative only;
- talent indicative minimum materially above that tolerance → hard block;
- when buyer selects `Rp100 jt+`, budget does not create an artificial upper hard block because no maximum was supplied.

Direct Talent Inquiry remains exempt from generic budget elimination. Buyer budget is negotiation context for the requested talent.

## Direct inquiry performance format

When a buyer enters through a real talent profile and that talent has approved performance formats, the buyer must choose one of those formats before submitting the inquiry.

The server must validate the submitted value against the requested talent's current approved `performance_formats`. A client-supplied format that is not offered by that talent must be rejected.

For V1, the selected format is persisted deterministically in `special_requirements` as:

`Format penampilan: <approved format>`

This is an explicit operational requirement, not an AI inference. The buyer's free-text note is also preserved verbatim for direct inquiry as an explicit `Catatan buyer:` requirement so the manager can receive the relevant scope without exposing buyer budget or internal commercial data.

AI-derived special requirements must not replace these direct explicit facts.

## Duration normalization

Until exact-minute entry is introduced, a bounded duration band is stored conservatively using its upper listed bound for operational planning (`15–30` → 30, `30–60` → 60, `60–90` → 90). `90+` is stored as 90 minutes as the stated lower planning boundary and must not be interpreted as a contractual exact duration.

The manager-confirmed event scope remains authoritative for the commercial offer.

## Offer validity

A manager/talent response marked `confirmed` is not commercially complete without both a positive event-specific fee and a future quote-valid-until timestamp.

This prevents an offer from remaining valid indefinitely and preserves the downstream rule that expired availability/commercial terms require reconfirmation before proposal/booking progression.

## Evidence

Deterministically normalized form fields must carry `explicit` or `normalized` field evidence using text that actually exists in the generated source text. Missing optional fields remain `missing`.

AI remains allowed to infer reviewable style/vibe signals from free-text notes, but unsupported evidence must never be upgraded to an explicit fact.
