# Pre-Show Task Ownership V1

Status: **CURRENT PRODUCT RULE**

## Purpose

After Show Advance is final-confirmed, Nusantara Star must not become the data-entry owner for operational facts controlled by Buyer/EO or Talent/Manager.

The pre-show checklist is therefore a shared operational workspace with explicit task ownership.

## Ownership

| Checkpoint | Task | Required party |
| --- | --- | --- |
| H-14 | Current Show Advance revision confirmed | System |
| H-14 | Venue address, access/loading, onsite PIC | Buyer / EO |
| H-7 | Final rider / technical requirements | Talent / Manager |
| H-7 | Personnel, lineup, backline | Talent / Manager |
| H-3 | Transport, accommodation, hospitality | Buyer / EO + Talent / Manager |
| H-3 | Buyer payment status vs schedule | Nusantara Star admin |
| H-1 | Load-in, call, soundcheck, show time | Buyer / EO + Talent / Manager |
| H-1 | Onsite, talent, technical contacts | Buyer / EO + Talent / Manager |

A shared task remains pending until every required party has responded.

## Secure access

Buyer/EO and Talent/Manager receive separate signed links. A signed link can update only tasks whose required parties include that party.

Public clients never receive direct table write privileges. The signed route verifies the token server-side and then calls a service-role-only RPC.

## Revision rule

Every pre-show task is tied to the current Show Advance revision.

If the Show Advance changes after pre-show starts:

1. operations pause while the new Show Advance revision is unconfirmed;
2. when buyer and talent final-confirm the new revision, all pre-show tasks are moved to that revision;
3. the system-owned Show Advance task is automatically completed;
4. all Buyer/EO, Talent/Manager, shared, and admin tasks return to pending;
5. prior task confirmations remain stored as revision history.

This is intentionally conservative: a changed operational source of truth requires the checklist to be revalidated.

## Completion gate

A show can be marked completed only when:

- booking status is pre_show;
- the current Show Advance revision is final-confirmed;
- the pre-show checklist exists;
- no checklist item is pending or tied to an older revision;
- no incident remains open.

Admin cannot bypass these gates through the normal operations API.

## Audit

pre_show_task_confirmations stores each party response by checklist item and Show Advance revision.

The current checklist item status is derived from the current revision's required-party responses:

- pending: at least one required party has not responded;
- done: all required parties responded and at least one response is done;
- not_applicable: all required parties responded not_applicable.
