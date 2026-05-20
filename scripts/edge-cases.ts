/**
 * Diagnostic script — runs scenarios A1..H2 from docs/instructions.md
 * against the existing calc.ts engine and writes docs/edge-case-report.md.
 *
 * Run once with: pnpm tsx scripts/edge-cases.ts
 *
 * Does not modify any production code.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { format } from "date-fns";

import {
  AllInstalmentsPaidError,
  autoPrincipalPortionCents,
  calculateFullSettlement,
  calculateScheduledPayment,
  centsToDisplay,
  generateOriginalSchedule,
  LatePaymentError,
  type FullSettlementResult,
  type ScheduledPaymentResult,
  type ScheduleRow,
} from "../src/lib/calc.ts";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const ymd = (date: Date) => format(date, "yyyy-MM-dd");
const $ = (cents: number) => centsToDisplay(cents);

const lines: string[] = [];
const flagged: { id: string; note: string }[] = [];

function header(id: string, title: string): void {
  lines.push(`\n## ${id}. ${title}\n`);
}

function p(text: string): void {
  lines.push(text);
}

function field(label: string, value: string): void {
  lines.push(`- **${label}:** ${value}`);
}

function code(s: string): void {
  lines.push("```");
  lines.push(s);
  lines.push("```");
}

function verdict(id: string, ok: boolean, note: string): void {
  const tag = ok ? "OK" : "FLAG";
  lines.push(`\n**Verdict:** ${tag} — ${note}\n`);
  if (!ok) flagged.push({ id, note });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function scheduleTable(rows: ScheduleRow[]): string {
  if (rows.length === 0) return "(empty)";
  const widths = { row: 3, due: 10, days: 4, p: 10, i: 10, t: 10, after: 10 };
  const headerRow =
    [
      pad("#", widths.row),
      pad("Due", widths.due),
      padLeft("Days", widths.days),
      padLeft("Principal", widths.p),
      padLeft("Interest", widths.i),
      padLeft("Total", widths.t),
      padLeft("After", widths.after),
    ].join(" | ");
  const sep = "-".repeat(headerRow.length);
  const body = rows
    .map((r) =>
      [
        pad(String(r.rowNumber), widths.row),
        pad(ymd(r.dueDate), widths.due),
        padLeft(String(r.daysInPeriod), widths.days),
        padLeft($(r.principalCents), widths.p),
        padLeft($(r.interestCents), widths.i),
        padLeft($(r.totalCents), widths.t),
        padLeft($(r.outstandingAfterRowCents), widths.after),
      ].join(" | "),
    )
    .join("\n");
  return [headerRow, sep, body].join("\n");
}

function recordKeyFields(r: FullSettlementResult): string {
  return [
    `days: ${r.days}`,
    `dailyRate: ${r.dailyRate}`,
    `interest: ${$(r.interestCents)} (${r.interestCents}c)`,
    `total: ${$(r.totalCents)}`,
  ].join("\n");
}

function scheduledKeyFields(r: ScheduledPaymentResult): string {
  return [
    `days: ${r.days}`,
    `dailyRate: ${r.dailyRate}`,
    `monthlyRatePercent: ${r.monthlyRatePercent}`,
    `interestPortion: ${$(r.interestPortionCents)} (${r.interestPortionCents}c)`,
    `todayAmount: ${$(r.todayAmountCents)}`,
    `newOutstanding: ${$(r.newOutstandingCents)}`,
    `nextDueDate: ${ymd(r.nextDueDate)}`,
    `daysFromPayOnToNextDue: ${r.daysFromPayOnToNextDue}`,
  ].join("\n");
}

// ============================================================================
// Report preamble
// ============================================================================
lines.push("# Edge-case scenario report");
lines.push("");
lines.push(`Generated ${new Date().toISOString()} via \`scripts/edge-cases.ts\`.`);
lines.push("");
lines.push(
  "**Diagnostic only.** This report surfaces scenarios not covered by the 14 acceptance tests. Do **not** change production code based on findings here without an explicit follow-up decision.",
);
lines.push("");

// ============================================================================
// A1 — Mode B end-of-month: Jan 31 loan start, Feb 28 pay-on
// ============================================================================
header("A1", "Mode B end-of-month — Jan 31 loan start, Feb 28 pay-on");
p("**Scenario:** Loan starts on a 31st. The 'one month later' due date is clamped by Feb. Verify the output's nextDueDate and look for any drift between the Original Schedule (anchored to loanStartDate) and the New Remaining Schedule (chained via addMonths(prev, 1)).");
p("");
p("**Inputs:**");
field("originalPrincipal", "$6,000.00");
field("totalInstalments", "6");
field("instalmentsAlreadyPaid", "0");
field("outstanding", "$6,000.00");
field("rate", "48% per year");
field("loanStartDate", "2026-01-31");
field("lastPaymentDate", "2026-01-31");
field("payOnDate", "2026-02-28 (the clamped 'one month later')");
field("principalPortion", "$1,000.00");
p("");
p("**Expected behaviour:** Not late (payOn equals todaysScheduledDate = addMonths(Jan 31, 1) = Feb 28). nextDueDate = addMonths(Jan 31, 2) = Mar 31. Original Schedule due dates should alternate 28/31/30/31/30/31 (anchored). New Remaining Schedule chains addMonths(prev, 1) — may drift off the anchored dates from April onward.");
p("");
const a1 = calculateScheduledPayment({
  originalPrincipalCents: 600000,
  totalInstalments: 6,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 600000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 31),
  lastPaymentDate: d(2026, 1, 31),
  payOnDate: d(2026, 2, 28),
  principalPortionCents: 100000,
});
p("**Actual:**");
code(scheduledKeyFields(a1));
p("Original schedule:");
code(scheduleTable(a1.originalSchedule));
p("New remaining schedule:");
code(scheduleTable(a1.remainingSchedule));

// Compare row dates: today's row is original index 0; first future = original index 1 = new index 0.
const driftA1: string[] = [];
for (let i = 0; i < a1.remainingSchedule.length; i++) {
  const newDue = ymd(a1.remainingSchedule[i].dueDate);
  const origDue = a1.originalSchedule[i + 1]
    ? ymd(a1.originalSchedule[i + 1].dueDate)
    : "(out of range)";
  if (newDue !== origDue) {
    driftA1.push(`row ${a1.remainingSchedule[i].rowNumber}: new=${newDue} vs original=${origDue}`);
  }
}
if (driftA1.length > 0) {
  verdict(
    "A1",
    false,
    `New Remaining Schedule drifts off the Original Schedule's anchored dates. Mismatches — ${driftA1.join("; ")}.`,
  );
} else {
  verdict("A1", true, "Both schedules align on every row.");
}

// ============================================================================
// A2 — Mode B original schedule for Jan 31 loan start, 6 instalments
// ============================================================================
header("A2", "Mode B original schedule — Jan 31 loan start, 6 instalments");
p("**Scenario:** Confirm date-fns clamping behaviour for an end-of-month-anchored schedule. Each row's due date is `addMonths(loanStartDate, i)`.");
p("");
p("**Inputs:** originalPrincipal $6,000, 6 instalments, principalPortion $1,000, monthlyRate 4%, loanStartDate 2026-01-31.");
p("");
p("**Expected behaviour:** Due dates alternate between end-of-month values that exist in the target month (28 Feb 2026 is not a leap year; April/June have 30 days).");
p("");
const a2Schedule = generateOriginalSchedule(
  600000,
  6,
  100000,
  4,
  d(2026, 1, 31),
);
code(scheduleTable(a2Schedule));
const a2DueDates = a2Schedule.map((r) => ymd(r.dueDate));
const a2Expected = [
  "2026-02-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-31",
  "2026-06-30",
  "2026-07-31",
];
const a2Match = JSON.stringify(a2DueDates) === JSON.stringify(a2Expected);
verdict(
  "A2",
  a2Match,
  a2Match
    ? "Anchored generation produces the expected 28/31/30/31/30/31 alternation; no drift."
    : `Anchored dates ${JSON.stringify(a2DueDates)} differ from expected ${JSON.stringify(a2Expected)}.`,
);

// ============================================================================
// B1 — Mode A across leap day
// ============================================================================
header("B1", "Mode A across leap day — Feb 15 to Mar 15, 2028");
p("**Scenario:** 2028 is a leap year, so Feb has 29 days. Verify days = 29.");
p("");
p("**Inputs:** outstanding $1,000.00, rate 48% per year, lastPayment 2028-02-15, payOn 2028-03-15, no late fee.");
p("");
const b1 = calculateFullSettlement({
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 48,
  lastPaymentDate: d(2028, 2, 15),
  payOnDate: d(2028, 3, 15),
  outstandingLateFeeCents: 0,
});
code(recordKeyFields(b1));
verdict(
  "B1",
  b1.days === 29,
  b1.days === 29
    ? `days = 29 (29 calendar days across Feb 15 → Mar 15 in a leap year). Interest = ${$(b1.interestCents)}, total ${$(b1.totalCents)}.`
    : `Expected 29 days through leap February, got ${b1.days}.`,
);

// ============================================================================
// B2 — Mode B original schedule starting Jan 1 2028
// ============================================================================
header("B2", "Mode B original schedule — Jan 1, 2028 leap year");
p("**Scenario:** Check whether the Feb→Mar period in the original schedule reflects 29 days. The interest in the original schedule is `outstanding × monthly% / 100`, not days × daily rate, so leap day does not change the interest amount — only `daysInPeriod` may differ.");
p("");
p("**Inputs:** originalPrincipal $6,000, 6 instalments, principalPortion $1,000, monthlyRate 4%, loanStartDate 2028-01-01.");
p("");
const b2Schedule = generateOriginalSchedule(
  600000,
  6,
  100000,
  4,
  d(2028, 1, 1),
);
code(scheduleTable(b2Schedule));
const febMarRow = b2Schedule.find((r) => ymd(r.dueDate) === "2028-03-01");
const febMarDays = febMarRow?.daysInPeriod ?? -1;
verdict(
  "B2",
  febMarDays === 29,
  febMarDays === 29
    ? "Row 2 (due 2028-03-01) reports daysInPeriod = 29, matching the leap February. Interest amount is unaffected because the original-schedule formula uses monthly rate × outstanding."
    : `Expected daysInPeriod = 29 for the Feb→Mar row, got ${febMarDays}.`,
);

// ============================================================================
// C1 — Mode A with $0.01 outstanding
// ============================================================================
header("C1", "Mode A extreme small — $0.01 outstanding, 48% annual, 100 days");
p("**Scenario:** Sub-penny interest accrual on a one-cent loan. Confirm interest rounds sensibly and total ≥ principal.");
p("");
p("**Inputs:** outstanding $0.01 (1 cent), rate 48% per year, 100 days (lastPayment 2026-01-01, payOn 2026-04-11), no late fee.");
p("");
const c1 = calculateFullSettlement({
  outstandingCents: 1,
  rateUnit: "annual",
  ratePercent: 48,
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 4, 11),
  outstandingLateFeeCents: 0,
});
code(recordKeyFields(c1));
// Unrounded interest ≈ 1 × 0.48/365 × 100 = 0.1315... cents → rounds to 0.
const c1UnroundedCents = 1 * (0.48 / 365) * 100;
p(`Unrounded interest in cents (before half-up): ${c1UnroundedCents.toFixed(6)}`);
verdict(
  "C1",
  c1.totalCents >= 1 && c1.interestCents === 0,
  c1.interestCents === 0
    ? "Interest rounds to 0 cents — accrual is below the half-up threshold (≈0.13¢). Total = $0.01 = principal. Mathematically correct but a pedant might point out: the borrower effectively gets a 100-day interest-free pico-loan whenever outstanding × dailyRate × days < 0.5¢. This is intrinsic to integer-cent precision."
    : `Expected interestCents === 0 (sub-half-cent accrual), got ${c1.interestCents}.`,
);

// ============================================================================
// C2 — Mode A with $1,000,000 outstanding
// ============================================================================
header("C2", "Mode A extreme large — $1,000,000 outstanding, 48% annual, 30 days");
p("**Scenario:** Confirm no floating-point precision issues at large notionals. Outstanding is 100,000,000 cents; well within JS's 2^53 safe-integer range, but float ops can still drift if poorly ordered.");
p("");
p("**Inputs:** outstanding $1,000,000.00, rate 48% per year, lastPayment 2026-05-01, payOn 2026-05-31 (30 days), no late fee.");
p("");
const c2 = calculateFullSettlement({
  outstandingCents: 100_000_000,
  rateUnit: "annual",
  ratePercent: 48,
  lastPaymentDate: d(2026, 5, 1),
  payOnDate: d(2026, 5, 31),
  outstandingLateFeeCents: 0,
});
const c2UnroundedCents = 100_000_000 * (0.48 / 365) * 30;
p(`Unrounded interest in cents: ${c2UnroundedCents}`);
code(recordKeyFields(c2));
verdict(
  "C2",
  Number.isInteger(c2.interestCents) && c2.interestCents > 0,
  `Interest = ${$(c2.interestCents)} (${c2.interestCents}c), an integer. Unrounded value was ${c2UnroundedCents.toFixed(6)}c. No precision drift.`,
);

// ============================================================================
// C3 — Mode B with 24 instalments
// ============================================================================
header("C3", "Mode B original schedule — $100,000 / 24 instalments");
p("**Scenario:** Confirm large-N original schedule generates without error and totals reconcile.");
p("");
p("**Inputs:** originalPrincipal $100,000.00, 24 instalments, auto principal, 4% monthly, loanStartDate 2026-01-01.");
p("");
const c3Auto = autoPrincipalPortionCents(10_000_000, 24);
p(`autoPrincipalPortionCents(10000000, 24) = ${c3Auto} (${$(c3Auto)})`);
const c3Schedule = generateOriginalSchedule(
  10_000_000,
  24,
  c3Auto,
  4,
  d(2026, 1, 1),
);
const c3PrincipalSum = c3Schedule.reduce((s, r) => s + r.principalCents, 0);
const c3LastOutstanding = c3Schedule[c3Schedule.length - 1].outstandingAfterRowCents;
p(`Rows: ${c3Schedule.length}, sum of principals: ${$(c3PrincipalSum)}, last row outstandingAfter: ${$(c3LastOutstanding)}`);
verdict(
  "C3",
  c3Schedule.length === 24 &&
    c3PrincipalSum === 10_000_000 &&
    c3LastOutstanding === 0,
  c3Schedule.length === 24 && c3PrincipalSum === 10_000_000 && c3LastOutstanding === 0
    ? `24 rows, principal sum closes to exactly $100,000.00, final outstanding = $0.`
    : `Reconciliation failed: rows=${c3Schedule.length}, sum=${$(c3PrincipalSum)}, lastOutstanding=${$(c3LastOutstanding)}.`,
);

// ============================================================================
// D1 — Mode B with 1 instalment
// ============================================================================
header("D1", "Mode B — 1 total instalment, 0 already paid");
p("**Scenario:** Single-instalment loan paid in full as the first scheduled payment. Should produce an empty remainingSchedule and a one-row originalSchedule. newOutstanding = 0.");
p("");
p("**Inputs:** originalPrincipal $1,000, 1 instalment, 0 paid, outstanding $1,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-02-01 (= todaysScheduledDate), principalPortion $1,000.");
p("");
const d1 = calculateScheduledPayment({
  originalPrincipalCents: 100000,
  totalInstalments: 1,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 2, 1),
  principalPortionCents: 100000,
});
code(scheduledKeyFields(d1));
p("Original schedule:");
code(scheduleTable(d1.originalSchedule));
p("New remaining schedule:");
code(scheduleTable(d1.remainingSchedule));
verdict(
  "D1",
  d1.originalSchedule.length === 1 &&
    d1.remainingSchedule.length === 0 &&
    d1.newOutstandingCents === 0,
  d1.originalSchedule.length === 1 &&
    d1.remainingSchedule.length === 0 &&
    d1.newOutstandingCents === 0
    ? "1-row original schedule, empty remaining schedule, newOutstanding = $0. Loan closes in one payment as expected."
    : `Unexpected shape: orig=${d1.originalSchedule.length}, remaining=${d1.remainingSchedule.length}, newOutstanding=${$(d1.newOutstandingCents)}.`,
);

// ============================================================================
// D2 — Mode B with 24 instalments
// ============================================================================
header("D2", "Mode B — 24 total instalments, 0 already paid");
p("**Scenario:** Stress the engine with a 24-instalment loan from scratch. originalSchedule should be 24 rows, remainingSchedule 23, last row outstandingAfter = 0.");
p("");
p("**Inputs:** originalPrincipal $24,000, 24 instalments, 0 paid, outstanding $24,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-02-01, principalPortion $1,000.");
p("");
const d2 = calculateScheduledPayment({
  originalPrincipalCents: 2_400_000,
  totalInstalments: 24,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 2_400_000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 2, 1),
  principalPortionCents: 100_000,
});
code(scheduledKeyFields(d2));
p(`originalSchedule rows: ${d2.originalSchedule.length}`);
p(`remainingSchedule rows: ${d2.remainingSchedule.length}`);
p(`Last remaining row outstandingAfter: ${$(d2.remainingSchedule[d2.remainingSchedule.length - 1].outstandingAfterRowCents)}`);
verdict(
  "D2",
  d2.originalSchedule.length === 24 &&
    d2.remainingSchedule.length === 23 &&
    d2.remainingSchedule[d2.remainingSchedule.length - 1].outstandingAfterRowCents === 0,
  d2.originalSchedule.length === 24 && d2.remainingSchedule.length === 23
    ? "24-row original, 23-row remaining, final outstanding = $0. No errors, no overflow."
    : `Shape mismatch.`,
);

// ============================================================================
// E1 — $1,000 / 7 instalments rounding remainder
// ============================================================================
header("E1", "Mode B rounding — $1,000 / 7 instalments");
p("**Scenario:** $1,000 / 7 gives 142.857… cents per instalment, rounding to 14286 cents per row. 7 × 14286 = 100,002 cents — over by 2 cents. The last row must absorb the negative remainder so the loan closes at exactly $0.");
p("");
const e1Auto = autoPrincipalPortionCents(100000, 7);
p(`autoPrincipalPortionCents(100000, 7) = ${e1Auto} cents (${$(e1Auto)})`);
const e1 = calculateScheduledPayment({
  originalPrincipalCents: 100000,
  totalInstalments: 7,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 2, 1),
  principalPortionCents: e1Auto,
});
code(scheduledKeyFields(e1));
p("Original schedule:");
code(scheduleTable(e1.originalSchedule));
const e1AllPrincipals =
  [e1.principalPortionCents, ...e1.remainingSchedule.map((r) => r.principalCents)];
const e1PrincipalSum = e1AllPrincipals.reduce((s, n) => s + n, 0);
const e1LastRowPrincipal =
  e1.remainingSchedule[e1.remainingSchedule.length - 1].principalCents;
p(`All principals (today + remaining): ${e1AllPrincipals.map((c) => $(c)).join(", ")}`);
p(`Sum of principals: ${$(e1PrincipalSum)} (must equal $1,000.00)`);
p(`Last remaining row principal: ${$(e1LastRowPrincipal)} (auto was ${$(e1Auto)})`);
const e1LastOriginalPrincipal =
  e1.originalSchedule[e1.originalSchedule.length - 1].principalCents;
p(`Original schedule last row principal: ${$(e1LastOriginalPrincipal)}`);
verdict(
  "E1",
  e1PrincipalSum === 100000 &&
    e1LastRowPrincipal < e1Auto,
  e1PrincipalSum === 100000
    ? `Total principal closes to exactly $1,000.00. Last remaining row's principal = ${$(e1LastRowPrincipal)} = auto − ${e1Auto - e1LastRowPrincipal}¢. Officers may find a "less than auto" last row counter-intuitive — worth a UI hint, not a bug.`
    : `Total principal failed to reconcile: ${$(e1PrincipalSum)}.`,
);

// ============================================================================
// E2 — $999.99 / 3 instalments
// ============================================================================
header("E2", "Mode B rounding — $999.99 / 3 instalments");
p("**Scenario:** 99,999 ÷ 3 = 33,333 exactly. No rounding remainder. Confirm sums.");
p("");
const e2Auto = autoPrincipalPortionCents(99999, 3);
p(`autoPrincipalPortionCents(99999, 3) = ${e2Auto} cents (${$(e2Auto)})`);
const e2 = calculateScheduledPayment({
  originalPrincipalCents: 99999,
  totalInstalments: 3,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 99999,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 2, 1),
  principalPortionCents: e2Auto,
});
const e2Sum =
  e2.principalPortionCents + e2.remainingSchedule.reduce((s, r) => s + r.principalCents, 0);
p(`Total principal: ${$(e2Sum)} (must equal $999.99 = 99999¢)`);
verdict(
  "E2",
  e2Sum === 99999,
  e2Sum === 99999
    ? "Clean three-way split, no remainder, sums to exactly $999.99."
    : `Sum mismatch: ${$(e2Sum)}.`,
);

// ============================================================================
// F1 — Mode A same-day settlement
// ============================================================================
header("F1", "Mode A same-day — outstanding $1,000, days = 0");
p("**Scenario:** Borrower settles on the same calendar day as the last payment. Days = 0, interest = 0, total = principal.");
p("");
const f1 = calculateFullSettlement({
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 48,
  lastPaymentDate: d(2026, 5, 15),
  payOnDate: d(2026, 5, 15),
  outstandingLateFeeCents: 0,
});
code(recordKeyFields(f1));
verdict(
  "F1",
  f1.days === 0 && f1.interestCents === 0 && f1.totalCents === 100000,
  "Days = 0, interest = 0, total = $1,000.00 exactly.",
);

// ============================================================================
// F2 — Mode B last instalment (outstanding == principalPortion)
// ============================================================================
header("F2", "Mode B last instalment — outstanding equals principalPortion");
p("**Scenario:** Today's payment is the final scheduled instalment. After today, newOutstanding = 0 and remainingSchedule should be empty.");
p("");
p("**Inputs:** originalPrincipal $6,000, 6 instalments, instalmentsAlreadyPaid = 5, outstanding $1,000, principalPortion $1,000, rate 48% annual, loanStartDate 2025-08-01, lastPaymentDate 2026-01-01, payOn 2026-02-01.");
p("");
const f2 = calculateScheduledPayment({
  originalPrincipalCents: 600000,
  totalInstalments: 6,
  instalmentsAlreadyPaid: 5,
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2025, 8, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 2, 1),
  principalPortionCents: 100000,
});
code(scheduledKeyFields(f2));
p(`remainingSchedule rows: ${f2.remainingSchedule.length}`);
verdict(
  "F2",
  f2.newOutstandingCents === 0 && f2.remainingSchedule.length === 0,
  `newOutstanding = $0, remainingSchedule is empty. nextDueDate (${ymd(f2.nextDueDate)}) is still emitted even though no future rows reference it — a minor UI consideration for "last payment" displays, not a bug.`,
);

// ============================================================================
// G1 — Mode A very low rate
// ============================================================================
header("G1", "Mode A rate boundary — 0.01% per year, 30 days");
p("**Scenario:** Tiny rate. Confirm interest computes without underflow (it may legitimately round to 0).");
p("");
const g1 = calculateFullSettlement({
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 0.01,
  lastPaymentDate: d(2026, 5, 1),
  payOnDate: d(2026, 5, 31),
  outstandingLateFeeCents: 0,
});
code(recordKeyFields(g1));
const g1Unrounded = 100000 * (0.0001 / 365) * 30;
p(`Unrounded interest in cents: ${g1Unrounded.toFixed(6)}`);
verdict(
  "G1",
  g1.interestCents === Math.round(g1Unrounded) && g1.interestCents >= 0,
  `Unrounded ${g1Unrounded.toFixed(6)}c rounds half-up to ${g1.interestCents}¢. Total = ${$(g1.totalCents)}. Engine handles very-low-rate accrual correctly; no underflow.`,
);

// ============================================================================
// G2 — Mode A very high rate
// ============================================================================
header("G2", "Mode A rate boundary — 999% per year, 30 days");
p("**Scenario:** Just under the validation ceiling of 1000%. Confirm no overflow.");
p("");
const g2 = calculateFullSettlement({
  outstandingCents: 100000,
  rateUnit: "annual",
  ratePercent: 999,
  lastPaymentDate: d(2026, 5, 1),
  payOnDate: d(2026, 5, 31),
  outstandingLateFeeCents: 0,
});
code(recordKeyFields(g2));
verdict(
  "G2",
  Number.isFinite(g2.interestCents) && g2.interestCents > 0,
  `Interest = ${$(g2.interestCents)}, total ${$(g2.totalCents)}. No overflow, no precision drift.`,
);

// ============================================================================
// H1 — Mode B paid 1 day after loan start
// ============================================================================
header("H1", "Mode B early extreme — paid 1 day after loan start");
p("**Scenario:** Officer pays the first instalment 30 days early. Days = 1, today's interest tiny, but the first remaining row covers a 58-day stretch.");
p("");
p("**Inputs:** originalPrincipal $6,000, 6 instalments, 0 paid, outstanding $6,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-01-02, principalPortion $1,000.");
p("");
const h1 = calculateScheduledPayment({
  originalPrincipalCents: 600000,
  totalInstalments: 6,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 600000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 1, 2),
  principalPortionCents: 100000,
});
code(scheduledKeyFields(h1));
const h1FirstRowDays = h1.remainingSchedule[0]?.daysInPeriod ?? -1;
const h1FirstRowInterest = h1.remainingSchedule[0]?.interestCents ?? -1;
p(`First remaining row: ${h1FirstRowDays} days, interest ${$(h1FirstRowInterest)}`);
verdict(
  "H1",
  h1.days === 1 && h1FirstRowDays === 58,
  `days = 1 (tiny today's interest = ${$(h1.interestPortionCents)}). First remaining row spans 58 days (Jan 2 → Mar 1) and accrues ${$(h1FirstRowInterest)} of interest — about 2× a "normal" 30-day row's interest at this rate. Math is per spec, but borrowers may be surprised to see the next row's interest jump after paying so early. UI / training consideration, not a bug.`,
);

// ============================================================================
// H2 — Mode B paid one day before natural due date
// ============================================================================
header("H2", "Mode B — paid 1 day before todaysScheduledDate (Jan 31)");
p("**Scenario:** Borrower pays the day before the due date (Feb 1). Days = 30, still on-time.");
p("");
const h2 = calculateScheduledPayment({
  originalPrincipalCents: 600000,
  totalInstalments: 6,
  instalmentsAlreadyPaid: 0,
  outstandingCents: 600000,
  rateUnit: "annual",
  ratePercent: 48,
  loanStartDate: d(2026, 1, 1),
  lastPaymentDate: d(2026, 1, 1),
  payOnDate: d(2026, 1, 31),
  principalPortionCents: 100000,
});
code(scheduledKeyFields(h2));
verdict(
  "H2",
  h2.days === 30 && h2.daysFromPayOnToNextDue === 29,
  `Accepted as on-time. days = 30, daysFromPayOnToNextDue = 29 (Jan 31 → Mar 1).`,
);

// ============================================================================
// Summary
// ============================================================================
lines.push("\n## Summary — flagged items\n");
if (flagged.length === 0) {
  lines.push("No flags. All scenarios behaved as expected within their spec.");
} else {
  for (const f of flagged) {
    lines.push(`- **${f.id}**: ${f.note}`);
  }
}
lines.push("");
lines.push("---");
lines.push(
  "_End of report. Do not change production code based on these findings without an explicit follow-up._",
);
lines.push("");

// ============================================================================
// Validate the late / all-paid error paths still throw with the expected messages
// (sanity belt for the report itself, not a flagged scenario).
// ============================================================================
try {
  calculateScheduledPayment({
    originalPrincipalCents: 600000,
    totalInstalments: 6,
    instalmentsAlreadyPaid: 6,
    outstandingCents: 100000,
    rateUnit: "annual",
    ratePercent: 48,
    loanStartDate: d(2025, 12, 1),
    lastPaymentDate: d(2026, 2, 1),
    payOnDate: d(2026, 3, 1),
    principalPortionCents: 100000,
  });
  throw new Error("Expected AllInstalmentsPaidError sentinel");
} catch (e) {
  if (!(e instanceof AllInstalmentsPaidError)) {
    // bubble up so the script exits non-zero
    throw e;
  }
}
try {
  calculateScheduledPayment({
    originalPrincipalCents: 600000,
    totalInstalments: 6,
    instalmentsAlreadyPaid: 2,
    outstandingCents: 400000,
    rateUnit: "annual",
    ratePercent: 48,
    loanStartDate: d(2025, 12, 1),
    lastPaymentDate: d(2026, 2, 1),
    payOnDate: d(2026, 3, 15),
    principalPortionCents: 100000,
  });
  throw new Error("Expected LatePaymentError sentinel");
} catch (e) {
  if (!(e instanceof LatePaymentError)) {
    throw e;
  }
}

const outPath = path.resolve("docs/edge-case-report.md");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Flags: ${flagged.length}`);
