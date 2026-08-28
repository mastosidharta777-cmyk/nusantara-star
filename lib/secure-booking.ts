export type BuyerMilestone = {
  sequence_no: number;
  calculation_type: "percentage" | "fixed_amount" | "remaining_balance";
  percentage: number | null;
  amount: number | null;
};

export function resolveMilestoneAmounts(rows: BuyerMilestone[], total: number) {
  let used = 0;
  return [...rows]
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map((row) => {
      let resolved = 0;
      if (row.calculation_type === "percentage") resolved = Math.round(total * ((row.percentage ?? 0) / 100));
      else if (row.calculation_type === "fixed_amount") resolved = Number(row.amount ?? 0);
      else resolved = Math.max(0, total - used);
      used += resolved;
      return { ...row, resolvedAmount: resolved };
    });
}

export function requiredInitialBuyerSecurity(rows: BuyerMilestone[], total: number) {
  const resolved = resolveMilestoneAmounts(rows, total);
  return resolved[0]?.resolvedAmount ?? total;
}
