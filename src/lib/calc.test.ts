import { describe, expect, it } from "vitest";
import {
  calculateFullSettlement,
  calculateScheduledPayment,
  centsToDisplay,
  daysBetween,
} from "./calc";

// Date constructor uses LOCAL midnight (year, monthIndex, day) so the test is
// timezone-independent. differenceInCalendarDays operates on the local
// calendar, so building dates the same way keeps day counts stable.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("daysBetween — actual calendar days", () => {
  it("counts 30 calendar days", () => {
    expect(daysBetween(d(2026, 4, 21), d(2026, 5, 21))).toBe(30);
  });
  it("counts 14 calendar days within a cycle", () => {
    expect(daysBetween(d(2026, 4, 1), d(2026, 4, 15))).toBe(14);
  });
  it("counts a 31-day calendar month as 31 (NOT 30)", () => {
    expect(daysBetween(d(2026, 5, 21), d(2026, 6, 21))).toBe(31);
  });
  it("throws when pay-on is before the last payment date", () => {
    expect(() => daysBetween(d(2026, 5, 21), d(2026, 4, 21))).toThrow(
      /before the last payment date/,
    );
  });
});

describe("Full Settlement (Mode A) — actual-days/365 tests", () => {
  it("TEST A1: full settlement (20 days)", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 21),
      outstandingLateFeeCents: 0,
    });

    expect(result.days).toBe(20);
    expect(result.dailyRate).toBe(0.48 / 365);
    // roundHalfUp(240000 × 0.48/365 × 20) = roundHalfUp(6312.33) = 6312
    expect(result.interestCents).toBe(6312);
    expect(result.totalCents).toBe(246312);
    expect(centsToDisplay(result.totalCents)).toBe("$2,463.12");
  });

  it("TEST A2: with late fee — interest method unchanged", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 21),
      outstandingLateFeeCents: 6000,
    });

    expect(result.days).toBe(20);
    expect(result.interestCents).toBe(6312);
    expect(result.outstandingLateFeeCents).toBe(6000);
    expect(result.totalCents).toBe(252312);
    expect(centsToDisplay(result.totalCents)).toBe("$2,523.12");
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

describe("Scheduled Payment (Mode B) — actual-days/365 tests", () => {
  it("TEST B1: 30-day gap", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 210480,
      annualRatePercent: 39,
      monthlyPaymentCents: 23452,
      lastPaymentDate: d(2026, 4, 21),
      payOnDate: d(2026, 5, 21),
    });
    expect(r.days).toBe(30);
    // roundHalfUp(210480 × 0.39/365 × 30) = roundHalfUp(6746.9) = 6747
    expect(r.interestCents).toBe(6747);
    expect(r.principalCents).toBe(16705);
    expect(r.todayAmountCents).toBe(23452);
    expect(r.newOutstandingCents).toBe(193775);
    expect(centsToDisplay(r.interestCents)).toBe("$67.47");
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$1,937.75");
  });

  it("TEST B2: early payment within a cycle (14 days)", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 200000,
      annualRatePercent: 39,
      monthlyPaymentCents: 23452,
      lastPaymentDate: d(2026, 4, 1),
      payOnDate: d(2026, 4, 15),
    });
    expect(r.days).toBe(14);
    // roundHalfUp(200000 × 0.39/365 × 14) = roundHalfUp(2991.78) = 2992
    expect(r.interestCents).toBe(2992);
    expect(r.principalCents).toBe(20460);
    expect(r.todayAmountCents).toBe(23452);
    expect(r.newOutstandingCents).toBe(179540);
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$1,795.40");
  });

  it("TEST B3: mid-schedule borrower (6 of 7), early (17 days)", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 120000,
      annualRatePercent: 39,
      monthlyPaymentCents: 23452,
      lastPaymentDate: d(2026, 4, 1),
      payOnDate: d(2026, 4, 18),
    });
    expect(r.days).toBe(17);
    // roundHalfUp(120000 × 0.39/365 × 17) = roundHalfUp(2179.726) = 2180.
    // NOTE: the instruction sheet shows $21.79 (2179) here, but that is the
    // truncated value; 2179.726 rounds half-up to 2180 = $21.80, consistent
    // with the spec's roundHalfUp method and every other case (e.g. B1's
    // 6746.9 → 6747). $21.80 is correct.
    expect(r.interestCents).toBe(2180);
    expect(r.principalCents).toBe(21272);
    expect(r.todayAmountCents).toBe(23452);
    expect(r.newOutstandingCents).toBe(98728);
    expect(centsToDisplay(r.interestCents)).toBe("$21.80");
    expect(centsToDisplay(r.newOutstandingCents)).toBe("$987.28");
  });

  it("TEST B4: same-day payment (0 days)", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 100000,
      annualRatePercent: 39,
      monthlyPaymentCents: 18613,
      lastPaymentDate: d(2026, 4, 4),
      payOnDate: d(2026, 4, 4),
    });
    expect(r.days).toBe(0);
    expect(r.interestCents).toBe(0);
    expect(r.principalCents).toBe(18613);
    expect(r.todayAmountCents).toBe(18613);
    expect(r.newOutstandingCents).toBe(81387);
  });

  it("TEST B5: first-payment stub — 16 days (must match CRM Loan 3)", () => {
    const r = calculateScheduledPayment({
      outstandingCents: 230000,
      annualRatePercent: 39,
      monthlyPaymentCents: 23452,
      lastPaymentDate: d(2025, 8, 21),
      payOnDate: d(2025, 9, 6),
    });
    expect(r.days).toBe(16);
    // roundHalfUp(230000 × 0.39/365 × 16) = roundHalfUp(3932.05) = 3932
    expect(r.interestCents).toBe(3932);
    expect(centsToDisplay(r.interestCents)).toBe("$39.32");
    expect(r.todayAmountCents).toBe(23452);
  });

  it("validation: outstanding > 0, rate > 0, monthly payment > 0, pay-on not before last", () => {
    const base = {
      outstandingCents: 200000,
      annualRatePercent: 39,
      monthlyPaymentCents: 23452,
      lastPaymentDate: d(2026, 4, 1),
      payOnDate: d(2026, 4, 15),
    };
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
      calculateScheduledPayment({ ...base, payOnDate: d(2026, 3, 1) }),
    ).toThrow(/before the last payment date/);
  });
});
