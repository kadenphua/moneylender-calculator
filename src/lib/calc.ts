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
