# Nusantara Star — QA Data Isolation V1

Status: **LOCKED SAFETY RULE**

This document extends `PRD-NUSANTARA-STAR-V1.md` for Preview and automated QA. It exists because Preview and Production may otherwise point to the same Supabase project and a stateful smoke test can create operational-looking records.

## Core rule

Stateful QA must never mutate the live operational Supabase project.

Non-mutating diagnostics may run in Preview. Any QA path that inserts, updates, deletes, calls state-changing RPCs, creates bookings/offers/proposals, or changes operational workflow state is a stateful QA path.

## Required gate

A hosted stateful QA route may run only when all are true:

1. `VERCEL_ENV` is not `production`;
2. `QA_MUTATIONS_ENABLED=true`;
3. `QA_SUPABASE_PROJECT_REF` is explicitly configured; and
4. `NEXT_PUBLIC_SUPABASE_URL` resolves exactly to `<QA_SUPABASE_PROJECT_REF>.supabase.co`.

If any condition is false, the request must fail closed before application mutation code executes.

Production must never enable `QA_MUTATIONS_ENABLED`.

## Environment rule

Preview used for stateful end-to-end testing must use a dedicated QA Supabase project, not the Production project. Sharing read-only public assets is a separate decision; sharing the mutable operational database is not permitted for stateful QA.

## Smoke cleanup rule

Cleanup is defense in depth, not the primary isolation mechanism. A stateful smoke test must still clean its own records and must treat cleanup failure as a failed test. A response must not claim `cleanup: automatic` unless deletion was verified.

## Real-data UAT rule

A real talent inquiry may be tested only up to the point that uses truthful data. Do not create fake manager availability, event fee, payment terms, rider confirmation, buyer selection, payment evidence, or booking state for a real talent merely to complete a test.

## End-to-end consistency

Any QA change must be checked against:

`Preview environment → Supabase project → mutation route → cleanup → admin visibility → buyer visibility → talent/manager state → proposal/deal/booking data → production safety`.
