import { addMonths, differenceInCalendarDays } from "date-fns";

export type RateUnit = "annual" | "monthly";

export interface FullSettlementInput {
  outstandingCents: number;
  rateUnit: RateUnit;
  ratePercent: number;
  lastPaymentDate: Date;
  payOnDate: Date;
  outstandingLateFeeCents?: number;
}

export interface FullSettlementResult {
  days: number;
  dailyRate: number;
  interestCents: number;
  outstandingLateFeeCents: number;
  totalCents: number;
}

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`roundHalfUp: value must be finite, got ${value}`);
  }
  if (value === 0) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`dollarsToCents: amount must be finite, got ${amount}`);
  }
  return roundHalfUp(amount * 100);
}

export function centsToDisplay(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`centsToDisplay: cents must be an integer, got ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  const centsStr = remainder.toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollarsStr}.${centsStr}`;
}

export function daysBetween(start: Date, end: Date): number {
  const days = differenceInCalendarDays(end, start);
  if (days < 0) {
    throw new Error(
      `daysBetween: end date (${end.toISOString()}) is before start date (${start.toISOString()})`,
    );
  }
  return days;
}

export function annualToDaily(annualRatePercent: number): number {
  return annualRatePercent / 100 / 365;
}

export function monthlyToDaily(monthlyRatePercent: number): number {
  return (monthlyRatePercent / 100) * 12 / 365;
}

export type CalculationMode = "fullSettlement" | "scheduled";

export class LatePaymentError extends Error {
  override name = "LatePaymentError";
  constructor() {
    super(
      "This is a late payment. Please use the legacy CRM for late payment calculations. This calculator handles on-time and early payments only.",
    );
  }
}

export class AllInstalmentsPaidError extends Error {
  override name = "AllInstalmentsPaidError";
  constructor() {
    super(
      "All instalments already paid. No further scheduled payment is due.",
    );
  }
}

export interface ScheduledPaymentInput {
  outstandingCents: number;
  originalPrincipalCents: number;
  totalInstalments: number;
  instalmentsAlreadyPaid: number;
  rateUnit: RateUnit;
  ratePercent: number;
  monthlyPaymentCents: number;
  loanStartDate: Date;
  lastPaymentDate: Date;
  payOnDate: Date;
}

export interface ScheduleRow {
  rowNumber: number;
  dueDate: Date;
  daysInPeriod: number;
  principalCents: number;
  interestCents: number;
  totalCents: number;
  outstandingAfterRowCents: number;
}

export interface ScheduledPaymentResult {
  days: number;
  dailyRate: number;
  monthlyRatePercent: number;
  daysInScheduledMonth: number;
  prorationFactor: number;
  scheduledInterestCents: number;
  principalPortionCents: number;
  interestPortionCents: number;
  todayAmountCents: number;
  newOutstandingCents: number;
  nextDueDate: Date;
  daysFromPayOnToNextDue: number;
  remainingSchedule: ScheduleRow[];
  originalSchedule: ScheduleRow[];
}

/**
 * Generates the full agreed instalment schedule (standard amortisation
 * against a fixed monthly payment). Each row's interest is computed as
 *   roundHalfUp(outstanding × monthlyRatePercent / 100)
 * and each row's principal is `monthlyPaymentCents − interest`. The last
 * row's principal is forced to whatever balance remains so the loan closes
 * at exactly zero, even if cumulative cent rounding doesn't divide evenly
 * (the last row's total may then differ from monthlyPaymentCents by a few
 * cents — matches the CRM behaviour).
 */
export function generateOriginalSchedule(
  originalPrincipalCents: number,
  totalInstalments: number,
  monthlyPaymentCents: number,
  monthlyRatePercent: number,
  loanStartDate: Date,
): ScheduleRow[] {
  if (!Number.isInteger(originalPrincipalCents) || originalPrincipalCents <= 0) {
    throw new Error(
      `generateOriginalSchedule: originalPrincipalCents must be a positive integer, got ${originalPrincipalCents}`,
    );
  }
  if (!Number.isInteger(totalInstalments) || totalInstalments < 1) {
    throw new Error(
      `generateOriginalSchedule: totalInstalments must be >= 1, got ${totalInstalments}`,
    );
  }
  if (!Number.isInteger(monthlyPaymentCents) || monthlyPaymentCents <= 0) {
    throw new Error(
      `generateOriginalSchedule: monthlyPaymentCents must be a positive integer, got ${monthlyPaymentCents}`,
    );
  }
  if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent < 0) {
    throw new Error(
      `generateOriginalSchedule: monthlyRatePercent must be a non-negative finite number, got ${monthlyRatePercent}`,
    );
  }

  const rows: ScheduleRow[] = [];
  let outstanding = originalPrincipalCents;
  for (let i = 1; i <= totalInstalments; i++) {
    const isLast = i === totalInstalments;
    const interestCents = roundHalfUp(
      (outstanding * monthlyRatePercent) / 100,
    );
    const principalCents = isLast
      ? outstanding
      : monthlyPaymentCents - interestCents;
    const totalCents = principalCents + interestCents;
    const outstandingAfterRowCents = isLast ? 0 : outstanding - principalCents;
    const dueDate = addMonths(loanStartDate, i);
    const prevDueDate = addMonths(loanStartDate, i - 1);
    rows.push({
      rowNumber: i,
      dueDate,
      daysInPeriod: differenceInCalendarDays(dueDate, prevDueDate),
      principalCents,
      interestCents,
      totalCents,
      outstandingAfterRowCents,
    });
    outstanding = outstandingAfterRowCents;
  }

  return rows;
}

export function calculateScheduledPayment(
  input: ScheduledPaymentInput,
): ScheduledPaymentResult {
  const {
    outstandingCents,
    originalPrincipalCents,
    totalInstalments,
    instalmentsAlreadyPaid,
    rateUnit,
    ratePercent,
    monthlyPaymentCents,
    loanStartDate,
    lastPaymentDate,
    payOnDate,
  } = input;

  if (!Number.isInteger(originalPrincipalCents) || originalPrincipalCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: originalPrincipalCents must be a positive integer, got ${originalPrincipalCents}`,
    );
  }
  if (!Number.isInteger(totalInstalments) || totalInstalments < 1) {
    throw new Error(
      `calculateScheduledPayment: totalInstalments must be >= 1, got ${totalInstalments}`,
    );
  }
  if (!Number.isInteger(instalmentsAlreadyPaid) || instalmentsAlreadyPaid < 0) {
    throw new Error(
      `calculateScheduledPayment: instalmentsAlreadyPaid must be a non-negative integer, got ${instalmentsAlreadyPaid}`,
    );
  }
  if (instalmentsAlreadyPaid >= totalInstalments) {
    throw new AllInstalmentsPaidError();
  }
  if (!Number.isInteger(outstandingCents) || outstandingCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: outstandingCents must be a positive integer, got ${outstandingCents}`,
    );
  }
  if (
    !Number.isFinite(ratePercent) ||
    ratePercent <= 0 ||
    ratePercent >= 1000
  ) {
    throw new Error(
      `calculateScheduledPayment: ratePercent must be > 0 and < 1000, got ${ratePercent}`,
    );
  }
  if (!Number.isInteger(monthlyPaymentCents) || monthlyPaymentCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: monthlyPaymentCents must be a positive integer, got ${monthlyPaymentCents}`,
    );
  }
  if (differenceInCalendarDays(lastPaymentDate, loanStartDate) < 0) {
    throw new Error("Last payment date cannot be before loan start date.");
  }

  // Lateness check: today's scheduled instalment is lastPaymentDate + 1 month.
  const todaysScheduledDate = addMonths(lastPaymentDate, 1);
  if (differenceInCalendarDays(payOnDate, todaysScheduledDate) > 0) {
    throw new LatePaymentError();
  }
  if (differenceInCalendarDays(payOnDate, lastPaymentDate) < 0) {
    throw new Error(
      `calculateScheduledPayment: payOnDate (${payOnDate.toISOString()}) is before lastPaymentDate (${lastPaymentDate.toISOString()})`,
    );
  }

  const monthlyRatePercent =
    rateUnit === "annual" ? ratePercent / 12 : ratePercent;
  // dailyRate is retained in the result for backward-compatibility with the
  // stored ScheduledPaymentOutputsStored shape; the new model does not use it
  // for interest math (interest is monthlyRatePercent-driven, prorated for
  // today only).
  const dailyRate =
    rateUnit === "annual"
      ? annualToDaily(ratePercent)
      : monthlyToDaily(ratePercent);

  // Today's payment — amortise the scheduled instalment, then prorate the
  // INTEREST portion by (days since last payment) / (days in the scheduled
  // month). Principal portion is unchanged regardless of timing — it always
  // equals the amount the borrower would have paid down on time.
  const daysSinceLastPayment = daysBetween(lastPaymentDate, payOnDate);
  const daysInScheduledMonth = differenceInCalendarDays(
    todaysScheduledDate,
    lastPaymentDate,
  );
  const prorationFactor =
    daysInScheduledMonth > 0
      ? daysSinceLastPayment / daysInScheduledMonth
      : 1;
  const scheduledInterestCents = roundHalfUp(
    (outstandingCents * monthlyRatePercent) / 100,
  );
  const proratedInterestCents = roundHalfUp(
    scheduledInterestCents * prorationFactor,
  );
  const principalPortionCents = monthlyPaymentCents - scheduledInterestCents;
  if (principalPortionCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: monthlyPaymentCents (${monthlyPaymentCents}) does not cover scheduled interest (${scheduledInterestCents}); principal portion would be non-positive`,
    );
  }
  if (principalPortionCents > outstandingCents) {
    throw new Error(
      `calculateScheduledPayment: principal portion derived from monthly payment (${principalPortionCents}) exceeds outstanding (${outstandingCents})`,
    );
  }
  const todayAmountCents = principalPortionCents + proratedInterestCents;
  const newOutstandingCents = outstandingCents - principalPortionCents;

  // Remaining schedule rows are numbered (instalmentsAlreadyPaid + 2)
  // .. totalInstalments, each anchored to loanStartDate via addMonths(start,
  // rowNumber). Same amortisation formula as the original schedule, just with
  // newOutstandingCents as the starting balance.
  const firstFutureRowNumber = instalmentsAlreadyPaid + 2;
  const firstFutureDueDate = addMonths(loanStartDate, firstFutureRowNumber);
  const daysFromPayOnToNextDue = differenceInCalendarDays(
    firstFutureDueDate,
    payOnDate,
  );

  const remainingSchedule: ScheduleRow[] = [];
  let remainingOutstandingCents = newOutstandingCents;
  let prevDueDate: Date = payOnDate;
  for (
    let rowNumber = firstFutureRowNumber;
    rowNumber <= totalInstalments;
    rowNumber++
  ) {
    const isLast = rowNumber === totalInstalments;
    const dueDate = addMonths(loanStartDate, rowNumber);
    const interestCents = roundHalfUp(
      (remainingOutstandingCents * monthlyRatePercent) / 100,
    );
    const principalCents = isLast
      ? remainingOutstandingCents
      : monthlyPaymentCents - interestCents;
    const totalCents = principalCents + interestCents;
    const outstandingAfterRowCents = isLast
      ? 0
      : remainingOutstandingCents - principalCents;

    remainingSchedule.push({
      rowNumber,
      dueDate,
      daysInPeriod: differenceInCalendarDays(dueDate, prevDueDate),
      principalCents,
      interestCents,
      totalCents,
      outstandingAfterRowCents,
    });

    remainingOutstandingCents = outstandingAfterRowCents;
    prevDueDate = dueDate;
  }

  const originalSchedule = generateOriginalSchedule(
    originalPrincipalCents,
    totalInstalments,
    monthlyPaymentCents,
    monthlyRatePercent,
    loanStartDate,
  );

  return {
    days: daysSinceLastPayment,
    dailyRate,
    monthlyRatePercent,
    daysInScheduledMonth,
    prorationFactor,
    scheduledInterestCents,
    principalPortionCents,
    interestPortionCents: proratedInterestCents,
    todayAmountCents,
    newOutstandingCents,
    nextDueDate: firstFutureDueDate,
    daysFromPayOnToNextDue,
    remainingSchedule,
    originalSchedule,
  };
}

export function calculateFullSettlement(
  input: FullSettlementInput,
): FullSettlementResult {
  const {
    outstandingCents,
    rateUnit,
    ratePercent,
    lastPaymentDate,
    payOnDate,
    outstandingLateFeeCents = 0,
  } = input;

  if (!Number.isInteger(outstandingCents) || outstandingCents <= 0) {
    throw new Error(
      `calculateFullSettlement: outstandingCents must be a positive integer, got ${outstandingCents}`,
    );
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    throw new Error(
      `calculateFullSettlement: ratePercent must be a non-negative finite number, got ${ratePercent}`,
    );
  }
  if (!Number.isInteger(outstandingLateFeeCents) || outstandingLateFeeCents < 0) {
    throw new Error(
      `calculateFullSettlement: outstandingLateFeeCents must be a non-negative integer, got ${outstandingLateFeeCents}`,
    );
  }

  const days = daysBetween(lastPaymentDate, payOnDate);
  const dailyRate =
    rateUnit === "annual"
      ? annualToDaily(ratePercent)
      : monthlyToDaily(ratePercent);

  const interestCents = roundHalfUp(outstandingCents * dailyRate * days);
  const totalCents = outstandingCents + interestCents + outstandingLateFeeCents;

  return {
    days,
    dailyRate,
    interestCents,
    outstandingLateFeeCents,
    totalCents,
  };
}
