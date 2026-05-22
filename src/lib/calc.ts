import { differenceInCalendarDays } from "date-fns";

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

// 30/360 day count: cap each day-of-month at 30, then count whole 30-day
// months plus the day difference. Used with a /360 divisor (see annualToDaily)
// so the whole calculator uses one consistent interest method. This is a
// deliberate business choice and intentionally differs from the legacy CRM
// (which uses 30-day months with a /365 divisor).
export function days360(start: Date, end: Date): number {
  const d1 = Math.min(start.getDate(), 30);
  const d2 = Math.min(end.getDate(), 30);
  return (
    (end.getFullYear() - start.getFullYear()) * 360 +
    (end.getMonth() - start.getMonth()) * 30 +
    (d2 - d1)
  );
}

// Throws if the pay-on date falls before the last payment date (calendar
// comparison, so month-end edges are handled correctly).
function assertPayOnNotBeforeLast(lastDate: Date, payOnDate: Date): void {
  if (differenceInCalendarDays(payOnDate, lastDate) < 0) {
    throw new Error("Pay-on date cannot be before the last payment date.");
  }
}

export function annualToDaily(annualRatePercent: number): number {
  return annualRatePercent / 100 / 360;
}

export function monthlyToDaily(monthlyRatePercent: number): number {
  return (monthlyRatePercent / 100) * 12 / 360;
}

export type CalculationMode = "fullSettlement" | "scheduled";

// ---------------------------------------------------------------------------
// Mode B — Scheduled Payment (daily-interest model)
//
// The borrower ALWAYS pays the fixed monthly payment amount. What varies with
// the payment date is the split between interest and principal:
//
//   days            = payOnDate − lastPaymentDate          (calendar days)
//   interest        = roundHalfUp(outstanding × annualRate/365 × days)
//   principal       = monthlyPayment − interest
//   newOutstanding  = outstanding − principal
//   todayAmount     = monthlyPayment                       (ALWAYS, fixed)
//
// Interest uses the same daily method as Mode A; the rate is always entered as
// a nominal annual percentage (e.g. 41 → 0.41/365 per day).
// ---------------------------------------------------------------------------

export interface ScheduledPaymentInput {
  outstandingCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  lastPaymentDate: Date;
  payOnDate: Date;
}

export interface ScheduledPaymentResult {
  days: number;
  dailyRate: number;
  interestCents: number;
  principalCents: number;
  todayAmountCents: number;
  newOutstandingCents: number;
}

export function calculateScheduledPayment(
  input: ScheduledPaymentInput,
): ScheduledPaymentResult {
  const {
    outstandingCents,
    annualRatePercent,
    monthlyPaymentCents,
    lastPaymentDate,
    payOnDate,
  } = input;

  if (!Number.isInteger(outstandingCents) || outstandingCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: outstandingCents must be a positive integer, got ${outstandingCents}`,
    );
  }
  if (
    !Number.isFinite(annualRatePercent) ||
    annualRatePercent <= 0 ||
    annualRatePercent >= 1000
  ) {
    throw new Error(
      `calculateScheduledPayment: annualRatePercent must be > 0 and < 1000, got ${annualRatePercent}`,
    );
  }
  if (!Number.isInteger(monthlyPaymentCents) || monthlyPaymentCents <= 0) {
    throw new Error(
      `calculateScheduledPayment: monthlyPaymentCents must be a positive integer, got ${monthlyPaymentCents}`,
    );
  }

  assertPayOnNotBeforeLast(lastPaymentDate, payOnDate);
  const days = days360(lastPaymentDate, payOnDate);
  const dailyRate = annualToDaily(annualRatePercent);
  const interestCents = roundHalfUp(outstandingCents * dailyRate * days);
  const principalCents = monthlyPaymentCents - interestCents;
  const newOutstandingCents = outstandingCents - principalCents;
  const todayAmountCents = monthlyPaymentCents;

  return {
    days,
    dailyRate,
    interestCents,
    principalCents,
    todayAmountCents,
    newOutstandingCents,
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

  assertPayOnNotBeforeLast(lastPaymentDate, payOnDate);
  const days = days360(lastPaymentDate, payOnDate);
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
