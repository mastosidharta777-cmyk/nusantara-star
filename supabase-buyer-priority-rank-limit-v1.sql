-- Nusantara Star — Buyer Priority Rank Limit V1
-- Align database constraint with the buyer UI/RPC: priority #1 through #3 only.

alter table public.buyer_preferences
  drop constraint if exists buyer_preferences_priority_rank_check;

alter table public.buyer_preferences
  add constraint buyer_preferences_priority_rank_check
  check (priority_rank between 1 and 3);
