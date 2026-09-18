# Collaborative Show Advance V2

Status: **CURRENT PRODUCT RULE**

V2 supersedes the admin-entry workflow in Show Advance V1.

## Ownership

### Auto from system
- booking / brief / talent identity
- event date and city
- performance duration from the booking brief, falling back to the talent profile
- available admin-approved rider versions

### Buyer / EO owns
- event timezone
- final venue and address
- load-in, call time, soundcheck, show start/end
- buyer/booker PIC
- onsite venue/EO PIC
- technical PIC
- technical provision
- access/loading and parking
- transport, accommodation, and hospitality arrangements

### Talent / Manager owns
- talent/manager/road-manager PIC
- personnel count and lineup
- final approved rider selection
- backline requirements
- talent operational notes

### Nusantara Star admin owns
- completeness and consistency review
- exception handling
- operational monitoring

Admin does **not** type or silently overwrite buyer-owned or talent-owned data.

## Revision flow

1. Booking must already be SECURED.
2. Buyer/EO receives a signed secure link and submits their fields.
3. Talent/Manager receives a separate signed secure link and submits their fields.
4. The system merges both submissions into one current Show Advance revision.
5. Admin review validates required fields, time order, duration, and rider state.
6. After review, buyer and talent each confirm the same revision through their own signed link.
7. Only when both confirmations are present does the revision become CONFIRMED.
8. Any later party edit creates a new revision, clears admin review and both confirmations, and requires the review/confirmation cycle again.
9. Pre-show checklist and show completion remain gated by the current confirmed revision.

## Security

Public users never receive direct database write privileges.

Signed-link API routes verify a scope-specific HMAC token server-side and then use server-only service-role RPC calls. Collaborative RPCs are executable only by service_role; anon/authenticated cannot execute them.

## Admin fallback

Legacy admin data-entry and manual dual-party confirmation RPCs are intentionally disabled. This prevents the control panel from becoming the operational data owner.

## Audit

Each buyer/talent submission, admin review, and signed-party confirmation is appended to booking_advance_party_actions. Final dual-party confirmations continue to be stored in booking_advance_confirmations.
