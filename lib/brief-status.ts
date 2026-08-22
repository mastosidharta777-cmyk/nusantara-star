const LEGACY_BRIEF_STATUS_RANK: Record<string, number> = {
  new: 0,
  reviewing: 10,
  matching: 20,
  availability_check: 30,
  shortlisted: 40,
  proposal_sent: 50,
  buyer_selected: 60,
  terms_agreed: 70,
  booked: 80,
  closed: 100,
  cancelled: 100,
};

const TERMINAL_STATUSES = new Set(["closed", "cancelled"]);

/**
 * Interim guard for the legacy single brief.status workflow.
 * PRD V1 replaces this with separate state machines, but until then no async
 * response is allowed to move a brief backwards through the funnel.
 */
export function forwardOnlyBriefStatus(current: string, proposed: string) {
  if (current === proposed) return current;
  if (TERMINAL_STATUSES.has(current)) return current;
  if (TERMINAL_STATUSES.has(proposed)) return proposed;

  const currentRank = LEGACY_BRIEF_STATUS_RANK[current];
  const proposedRank = LEGACY_BRIEF_STATUS_RANK[proposed];
  if (currentRank === undefined || proposedRank === undefined) return current;
  return proposedRank >= currentRank ? proposed : current;
}
