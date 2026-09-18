# Nusantara Star — Event-Specific Price Breakdown V1

Status: **LOCKED PRODUCT RULE**

## Agency rule

Talent/manager confirms the event-specific offer and their own commercial requirements. Nusantara Star then prepares the buyer-facing commercial proposal.

The buyer-facing proposal must separate operational components instead of presenting travel, accommodation, technical rider, taxes, and other costs as one ambiguous “artist price”.

## Buyer-facing components

Each proposal item may contain:

- Talent Fee
- Transport / local transfer
- Accommodation
- Technical / backline / rider
- Taxes / payment fees
- Other cost, with an explicit label

`buyer_price` is the frozen total and must equal the sum of the buyer-facing components.

Zero-value components are not charged. If an item is intentionally excluded or will be arranged by the buyer, it remains explicit in the offer's included/excluded notes.

## Internal vs buyer-facing price

`talent_offers.event_fee` remains the internal event-specific fee confirmed by talent/management.

The buyer-facing `talent_fee` in `proposal_items.price_breakdown` is the commercial price offered by Nusantara Star for the talent component. It must never be lower than the confirmed talent/manager event fee in V1.

Internal talent net fee, margin, contribution, or commission must not be exposed in the buyer proposal.

## Snapshot rule

The price breakdown is frozen into `proposal_items` when a proposal version is created.

A sent/viewed/selected proposal must not be silently repriced. Commercial changes require the normal proposal revision/version flow.

## Travel logic

Event city never excludes a talent from discovery.

If the engagement requires travel, the agency may:

1. quote transport/accommodation as explicit buyer-facing components; or
2. leave those components at zero and state clearly that they are excluded / buyer-arranged.

This keeps nationwide talent bookable without presenting misleading all-in pricing.
