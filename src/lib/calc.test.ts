import { describe, expect, it } from "vitest";
import {
  calculateFullSettlement,
  calculateScheduledPayment,
  centsToDisplay,
  days360,
} from "./calc";

// Date constructor uses LOCAL midnight (year, monthIndex, day) so the test is
// timezone-independent. days360 reads local getDate/getMonth/getFullYear, so
// building dates the same way keeps the day counts stable.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("days360 — 30/360 day count", () => {
  it("full 30-day month", () => {
    expect(days360(d(2026, 4, 21), d(2026, 5, 21))).toBe(30);
  });
  it("mid-month — 15 days", () => {
    expect(days360(d(2026, 4, 21), d(2026, 5, 6))).toBe(15);
  });
  it("31-day calendar month still counts 30", () => {
    expect(days360(d(2026, 5, 21), d(2026, 6, 21))).toBe(30);
  });
  it("end-of-month 31 caps to 30 — 39 days", () => {
    expect(days360(d(2026, 4, 21), d(2026, 5, 31))).toBe(39);
  });
  it("15 days across a different month/year", () => {
    expect(days360(d(2025, 8, 21), d(2025, 9, 6))).toBe(15);
  });
});

describe("Full Settlement (Mode A) — 30/360 acceptance tests", () => {
  it("TEST A1: full settlement, 30/360 (20 days)", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 21),
      outstandingLateFeeCents: 0,
    });

    expect(result.days).toBe(20);
    expect(result.dailyRate).toBe(0.48 / 360);
    // roundHalfUp(240000 × 0.48/360 × 20) = roundHalfUp(6400) = 6400
    expect(result.interestCents).toBe(6400);
    expect(result.totalCents).toBe(246400);
    expect(centsToDisplay(result.totalCents)).toBe("$2,464.00");
  });

  it("TEST A2: with late fee — only the interest method changed", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 21),
      outstandingLateFeeCents: 6000,
    });

    expect(result.days).toBe(20);
    expect(result.interestCents).toBe(6400);
    expect(result.outstandingLateFeeCents).toBe(6000);
    expect(result.totalCents).toBe(252400);
    expect(centsToDisplay(result.totalCents)).toBe("$2,524.00");
  });

  it("validation: outstanding > 0 and pay-on not before last date", () => {
    expect(() =>
      calculateFullSettlement({
        outstandingCents: 0,
        rateUnit: "annual",
        ratePercent: 48,
        lastPaymentDate: d(2026, 5, 1),
        payOnDate: d(2026, 5, 21),
        outstandingLateFeeCents: 0,
      }),
    ).toThrow(/outstandingCents/);
    expect(() =>
      calculateFullSettlement({
        outstandingCents: 240000,
        rateUnit: "annual",
        ratePercent: 48,
        lastPaymentDate: d(2026, 5, 21),
        payOnDate: d(2026, 5, 1),
        outstandingLateFeeCents: 0,
      }),
    ).toThrow(/before the last payment date/);
  });
});

describe("Scheduled Payment (Mode B) — 30/360 daily-interest tests", () => {
  const base = {
    outstandingCents: 210480,
    annualRatePercent: 39,
    monthlyPaymentCents: 23452,
    lastPaymentDate: d(2026, 4, 21),
    payOnDate: d(2026, 5, 21),
  };

  it("TEST B1: regular 30-day month", () => {
    const r = calculateScheduledPayment(base);
    expect(r.days).toBe(30);
    // roundHalfUp(210480 × 0.39/360 × 30) = roundHalfUp(6840.6) = 6841
    expect(r.interestCents).toBe(6841);
    expect(r.principalCents).toBe(16611);
    expect(r.todayAmountCents).toBe(23452);
    expect(r.newOutstandingCents).toBe(193869);
    expect(centsToDisplay(r.interestCents)).toBe("$68.41");
    expect(centsToDisplay(r.todayAmountCents)).toBe("$234.52");
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$1,938.69");
  });

  it("TEST B2: early payment — 15 days", () => {
    const r = calculateScheduledPayment({ ...base, payOnDate: d(2026, 5, 6) });
    expect(r.days).toBe(15);
    // roundHalfUp(210480 × 0.39/360 × 15) = roundHalfUp(3420.3) = 3420
    expect(r.interestCents).toBe(3420);
    expect(r.principalCents).toBe(20032);
    expect(r.todayAmountCents).toBe(23452);
    expect(r.newOutstandingCents).toBe(190448);
    expect(centsToDisplay(r.principalCents)).toBe("$200.32");
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$1,904.48");
  });

  it("TEST B3: 31-day calendar month still counts 30", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 500000,
      annualRatePercent: 41,
      monthlyPaymentCents: 60000,
      lastPaymentDate: d(2026, 5, 21),
      payOnDate: d(2026, 6, 21),
    });
    expect(r.days).toBe(30);
    // roundHalfUp(500000 × 0.41/360 × 30) = roundHalfUp(17083.33) = 17083
    expect(r.interestCents).toBe(17083);
    expect(r.principalCents).toBe(42917);
    expect(r.todayAmountCents).toBe(60000);
    expect(r.newOutstandingCents).toBe(457083);
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$4,570.83");
  });

  it("validation: outstanding > 0, rate > 0, monthly payment > 0, pay-on not before last", () => {
    expect(() =>
      calculateScheduledPayment({ ...base, outstandingCents: 0 }),
    ).toThrow(/outstandingCents/);
    expect(() =>
      calculateScheduledPayment({ ...base, annualRatePercent: 0 }),
    ).toThrow(/annualRatePercent/);
    expect(() =>
      calculateScheduledPayment({ ...base, monthlyPaymentCents: 0 }),
    ).toThrow(/monthlyPaymentCents/);
    expect(() =>
      calculateScheduledPayment({ ...base, payOnDate: d(2026, 4, 1) }),
    ).toThrow(/before the last payment date/);
  });
});
