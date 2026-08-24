export type DealMilestone = {
  milestone_type: string;
  sequence_no: number;
  calculation_type: "percentage" | "fixed_amount" | "remaining_balance";
  percentage: number | null;
  amount: number | null;
  due_basis: "booking_date" | "event_date" | "event_completion" | "invoice_date" | "custom_date";
  due_offset_days: number;
  custom_due_date?: string | null;
};

type FundingInput = {
  buyerPrice: number;
  talentPayable: number;
  directCosts: number | null;
  taxesAndPaymentFees: number | null;
  buyerSchedule: DealMilestone[];
  talentSchedule: DealMilestone[];
  eventDate: string | null;
  bookingReferenceDate: string | null;
  invoiceReferenceDate: string | null;
  directCostDueDate: string | null;
  taxFeeDueDate: string | null;
};

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function resolveDueDate(row: DealMilestone, input: FundingInput) {
  let base: string | null = null;
  if (row.due_basis === "booking_date") base = input.bookingReferenceDate;
  if (row.due_basis === "event_date" || row.due_basis === "event_completion") base = input.eventDate;
  if (row.due_basis === "invoice_date") base = input.invoiceReferenceDate;
  if (row.due_basis === "custom_date") base = row.custom_due_date ?? null;
  return base ? addDays(base, row.due_offset_days) : null;
}

function resolveAmounts(rows: DealMilestone[], total: number) {
  let used = 0;
  return rows.map((row) => {
    let amount = 0;
    if (row.calculation_type === "percentage") amount = Math.round(total * ((row.percentage ?? 0) / 100));
    if (row.calculation_type === "fixed_amount") amount = row.amount ?? 0;
    if (row.calculation_type === "remaining_balance") amount = Math.max(0, total - used);
    used += amount;
    return { ...row, resolvedAmount: amount };
  });
}

export function computeDealReview(input: FundingInput) {
  const issues: string[] = [];
  if (input.directCosts === null) issues.push("Direct costs belum dikonfirmasi");
  if (input.taxesAndPaymentFees === null) issues.push("Pajak/payment fee belum dikonfirmasi");
  if (!input.buyerSchedule.length) issues.push("Jadwal pembayaran buyer belum ditetapkan");
  if (!input.talentSchedule.length) issues.push("Jadwal pembayaran talent belum ditetapkan");

  const contribution =
    input.directCosts === null || input.taxesAndPaymentFees === null
      ? null
      : input.buyerPrice - input.talentPayable - input.directCosts - input.taxesAndPaymentFees;
  if (contribution !== null && contribution < 0) issues.push("Buyer price tidak menutup seluruh kewajiban deal");

  const dated: Array<{ date: string; amount: number }> = [];
  for (const row of resolveAmounts(input.buyerSchedule, input.buyerPrice)) {
    const date = resolveDueDate(row, input);
    if (!date) issues.push(`Tanggal kontraktual buyer tahap ${row.sequence_no} belum tersedia`);
    else dated.push({ date, amount: row.resolvedAmount });
  }
  for (const row of resolveAmounts(input.talentSchedule, input.talentPayable)) {
    const date = resolveDueDate(row, input);
    if (!date) issues.push(`Tanggal kontraktual talent tahap ${row.sequence_no} belum tersedia`);
    else dated.push({ date, amount: -row.resolvedAmount });
  }

  if ((input.directCosts ?? 0) > 0) {
    if (!input.directCostDueDate) issues.push("Tanggal jatuh tempo direct cost belum tersedia");
    else dated.push({ date: input.directCostDueDate, amount: -(input.directCosts ?? 0) });
  }
  if ((input.taxesAndPaymentFees ?? 0) > 0) {
    if (!input.taxFeeDueDate) issues.push("Tanggal jatuh tempo pajak/payment fee belum tersedia");
    else dated.push({ date: input.taxFeeDueDate, amount: -(input.taxesAndPaymentFees ?? 0) });
  }

  const uniqueIssues = [...new Set(issues)];
  if (uniqueIssues.some((issue) => issue.includes("Tanggal kontraktual") || issue.includes("Tanggal jatuh tempo")) || !input.buyerSchedule.length || !input.talentSchedule.length) {
    return { contribution, fundingGapAmount: null, fundingGapStatus: "unknown" as const, unresolvedIssues: uniqueIssues };
  }

  const byDate = new Map<string, number>();
  for (const item of dated) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.amount);
  const dates = [...byDate.keys()].sort();
  let cash = 0;
  let maxGap = 0;
  for (const date of dates) {
    cash += byDate.get(date) ?? 0;
    maxGap = Math.max(maxGap, Math.max(0, -cash));
  }
  if (maxGap > 0) uniqueIssues.push(`Funding gap maksimum Rp${maxGap.toLocaleString("id-ID")}`);

  return {
    contribution,
    fundingGapAmount: maxGap,
    fundingGapStatus: maxGap > 0 ? ("gap" as const) : ("safe" as const),
    unresolvedIssues: [...new Set(uniqueIssues)],
  };
}
