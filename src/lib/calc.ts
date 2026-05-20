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
  loanStartDate: Date;
  lastPaymentDate: Date;
  payOnDate: Date;
  principalPortionCents: number;
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
  principalPortionCents: number;
  interestPortionCents: number;
  todayAmountCents: number;
  newOutstandingCents: number;
  nextDueDate: Date;
  daysFromPayOnToNextDue: number;
  remainingSchedule: ScheduleRow[];
  originalSchedule: ScheduleRow[];
}

export function generateOriginalSchedule(
  originalPrincipalCents: number,
  totalInstalments: number,
  principalPortionCents: number,
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
  if (!Number.isInteger(principalPortionCents) || principalPortionCents <= 0) {
    throw new Error(
      `generateOriginalSchedule: principalPortionCents must be a positive integer, got ${principalPortionCents}`,
    );
  }
  if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent < 0) {
    throw new Error(
      `generateOriginalSchedule: monthlyRatePercent must be a non-negative finite number, got ${monthlyRatePercent}`,
    );
  }

  const rows: ScheduleRow[] = [];
  for (let i = 1; i <= totalInstalments; i++) {
    const isLast = i === totalInstalments;
    const outstandingAtStartCents =
      originalPrincipalCents - (i - 1) * principalPortionCents;
    const interestCents = roundHalfUp(
      (outstandingAtStartCents * monthlyRatePercent) / 100,
    );
    const principalCents = isLast
      ? outstandingAtStartCents
      : principalPortionCents;
    const totalCents = principalCents + interestCents;
    const outstandingAfterRowCents = isLast
      ? 0
      : outstandingAtStartCents - principalCents;
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
  }

  return rows;
}

export function autoPrincipalPortionCents(
  originalPrincipalCents: number,
  totalInstalments: number,
): number {
  if (!Number.isInteger(originalPrincipalCents) || originalPrincipalCents <= 0) {
    throw new Error(
      `autoPrincipalPortionCents: originalPrincipalCents must be a positive integer, got ${originalPrincipalCents}`,
    );
  }
  if (!Number.isInteger(totalInstalments) || totalInstalments < 1) {
    throw new Error(
      `autoPrincipalPortionCents: totalInstalments must be >= 1, got ${totalInstalments}`,
    );
  }
  return roundHalfUp(originalPrincipalCents / totalInstalments);
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
    loanStartDate,
    lastPaymentDate,
    payOnDate,
    principalPortionCents,
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
  if (!Number.isInteger(principalPortionCents) || principalPortionCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: principalPortionCents must be a positive integer, got ${principalPortionCents}`,
    );
  }
  if (principalPortionCents > outstandingCents) {
    throw new Error(
      `calculateScheduledPayment: principalPortionCents (${principalPortionCents}) must be <= outstandingCents (${outstandingCents})`,
    );
  }
  if (differenceInCalendarDays(lastPaymentDate, loanStartDate) < 0) {
    throw new Error("Last payment date cannot be before loan start date.");
  }

  // Lateness check: today's scheduled instalment is lastPaymentDate + 1 month.
  // payOnDate > that date => late => refuse and route officer to legacy CRM.
  const todaysScheduledDate = addMonths(lastPaymentDate, 1);
  if (differenceInCalendarDays(payOnDate, todaysScheduledDate) > 0) {
    throw new LatePaymentError();
  }
  if (differenceInCalendarDays(payOnDate, lastPaymentDate) < 0) {
    throw new Error(
      `calculateScheduledPayment: payOnDate (${payOnDate.toISOString()}) is before lastPaymentDate (${lastPaymentDate.toISOString()})`,
    );
  }

  // Today's payment.
  const days = daysBetween(lastPaymentDate, payOnDate);
  const dailyRate =
    rateUnit === "annual"
      ? annualToDaily(ratePercent)
      : monthlyToDaily(ratePercent);
  const monthlyRatePercent =
    rateUnit === "annual" ? ratePercent / 12 : ratePercent;
  const interestPortionCents = roundHalfUp(
    outstandingCents * dailyRate * days,
  );
  const todayAmountCents = principalPortionCents + interestPortionCents;
  const newOutstandingCents = outstandingCents - principalPortionCents;

  // Remaining schedule (Policy X — fixed original due dates).
  // First future row sits at the next ORIGINAL scheduled date AFTER today's
  // payment, i.e. lastPaymentDate + 2 months. (Spec asserts TEST 9's
  // nextDueDate == 2026-04-01 == lastPaymentDate + 2 months even though
  // today's payment was a week early.)
  const firstFutureDueDate = addMonths(lastPaymentDate, 2);
  const remainingCount = totalInstalments - instalmentsAlreadyPaid - 1;
  const daysFromPayOnToNextDue = differenceInCalendarDays(
    firstFutureDueDate,
    payOnDate,
  );

  // Anchor each remaining-schedule row to loanStartDate (same anchoring as
  // generateOriginalSchedule) so the two schedules never drift apart on
  // end-of-month loans. daysInPeriod is still the calendar gap from the
  // previous due date — or from payOnDate for row 0 — so interest is
  // computed against the actual elapsed days.
  const remainingSchedule: ScheduleRow[] = [];
  let remainingOutstandingCents = newOutstandingCents;
  let prevDueDate: Date = payOnDate;
  for (let i = 0; i < remainingCount; i++) {
    const isLast = i === remainingCount - 1;
    const dueDate = addMonths(
      loanStartDate,
      instalmentsAlreadyPaid + 2 + i,
    );
    const daysInPeriod = differenceInCalendarDays(dueDate, prevDueDate);
    const interestCents = roundHalfUp(
      remainingOutstandingCents * dailyRate * daysInPeriod,
    );
    const principalCents = isLast
      ? remainingOutstandingCents
      : principalPortionCents;
    const totalCents = principalCents + interestCents;
    const outstandingAfterRowCents = isLast
      ? 0
      : remainingOutstandingCents - principalCents;

    remainingSchedule.push({
      rowNumber: i + 1,
      dueDate,
      daysInPeriod,
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
    principalPortionCents,
    monthlyRatePercent,
    loanStartDate,
  );

  return {
    days,
    dailyRate,
    monthlyRatePercent,
    principalPortionCents,
    interestPortionCents,
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
