import { describe, expect, it } from "vitest";
import {
  calculateFullSettlement,
  centsToDisplay,
  roundHalfUp,
} from "./calc";

// Date constructor uses LOCAL midnight (year, monthIndex, day) so the test is
// timezone-independent. differenceInCalendarDays operates on the local
// calendar, so building dates the same way keeps day counts stable.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("Full Settlement — acceptance tests", () => {
  it("TEST 1: annual rate input — reference case", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 22),
      outstandingLateFeeCents: 0,
    });

    expect(result.days).toBe(21);
    expect(result.dailyRate).toBe(0.48 / 365);
    expect(result.dailyRate).toBeCloseTo(0.001315068493150685, 18);
    expect(result.interestCents).toBe(6628);
    expect(result.totalCents).toBe(246628);
    expect(centsToDisplay(result.totalCents)).toBe("$2,466.28");
  });

  it("TEST 2: monthly rate input — must equal TEST 1", () => {
    const annual = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 22),
      outstandingLateFeeCents: 0,
    });
    const monthly = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "monthly",
      ratePercent: 4,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 22),
      outstandingLateFeeCents: 0,
    });

    expect(monthly.dailyRate).toBe(annual.dailyRate);
    expect(monthly.interestCents).toBe(annual.interestCents);
    expect(monthly.totalCents).toBe(annual.totalCents);
    expect(centsToDisplay(monthly.totalCents)).toBe("$2,466.28");
  });

  it("TEST 3: same-day settlement — zero interest", () => {
    const result = calculateFullSettlement({
      outstandingCents: 100000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 15),
      payOnDate: d(2026, 5, 15),
      outstandingLateFeeCents: 0,
    });

    expect(result.days).toBe(0);
    expect(result.interestCents).toBe(0);
    expect(result.totalCents).toBe(100000);
    expect(centsToDisplay(result.totalCents)).toBe("$1,000.00");
  });

  it("TEST 4: outstanding late fee adds to total", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 5, 22),
      outstandingLateFeeCents: 6000,
    });

    expect(result.days).toBe(21);
    expect(result.interestCents).toBe(6628);
    expect(result.outstandingLateFeeCents).toBe(6000);
    expect(result.totalCents).toBe(252628);
    expect(centsToDisplay(result.totalCents)).toBe("$2,526.28");
  });

  it("TEST 5: half-up rounding boundary — NOT banker's rounding", () => {
    // Direct helper checks — Math.round() (banker's) would return 1234, 2, 0.
    expect(roundHalfUp(1234.5)).toBe(1235);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);

    // End-to-end: $100 × 1.825%/yr × 1 day = exactly 0.5 cents.
    // 0.01825 / 365 = 0.00005 exactly; 10000 × 0.00005 × 1 = 0.5.
    // roundHalfUp must round 0.5 → 1 cent of interest.
    const result = calculateFullSettlement({
      outstandingCents: 10000,
      rateUnit: "annual",
      ratePercent: 1.825,
      lastPaymentDate: d(2026, 1, 1),
      payOnDate: d(2026, 1, 2),
      outstandingLateFeeCents: 0,
    });
    expect(result.days).toBe(1);
    expect(result.interestCents).toBe(1);
    expect(result.totalCents).toBe(10001);
  });

  it("TEST 6: forward quote — 45 days", () => {
    const result = calculateFullSettlement({
      outstandingCents: 240000,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 5, 1),
      payOnDate: d(2026, 6, 15),
      outstandingLateFeeCents: 0,
    });

    expect(result.days).toBe(45);
    // 240000 × (0.48/365) × 45 = 14202.7397260…  →  roundHalfUp → 14203
    const expectedInterest = Math.sign(240000 * (0.48 / 365) * 45) *
      Math.floor(Math.abs(240000 * (0.48 / 365) * 45) + 0.5);
    expect(result.interestCents).toBe(expectedInterest);
    expect(result.interestCents).toBe(14203);
    expect(result.totalCents).toBe(254203);
    expect(centsToDisplay(result.totalCents)).toBe("$2,542.03");
  });

  it("TEST 7: payOn before lastPayment must throw", () => {
    expect(() =>
      calculateFullSettlement({
        outstandingCents: 240000,
        rateUnit: "annual",
        ratePercent: 48,
        lastPaymentDate: d(2026, 5, 22),
        payOnDate: d(2026, 5, 1),
        outstandingLateFeeCents: 0,
      }),
    ).toThrow(/before start/);
  });
});
