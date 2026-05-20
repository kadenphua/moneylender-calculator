import { describe, expect, it } from "vitest";
import {
  AllInstalmentsPaidError,
  autoPrincipalPortionCents,
  calculateFullSettlement,
  calculateScheduledPayment,
  centsToDisplay,
  LatePaymentError,
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

describe("Scheduled Payment (Mode B) — acceptance tests", () => {
  const baseTest8 = {
    outstandingCents: 400000,
    originalPrincipalCents: 600000,
    totalInstalments: 6,
    instalmentsAlreadyPaid: 2,
    rateUnit: "annual" as const,
    ratePercent: 48,
    lastPaymentDate: d(2026, 2, 1),
    payOnDate: d(2026, 3, 1),
    principalPortionCents: 100000,
  };

  it("TEST 8: scheduled on-time payment, even principal", () => {
    expect(autoPrincipalPortionCents(600000, 6)).toBe(100000);

    const result = calculateScheduledPayment(baseTest8);

    expect(result.days).toBe(28);
    expect(result.dailyRate).toBe(0.48 / 365);
    // 400000 × 0.48/365 × 28 = 14728.7671...  →  roundHalfUp → 14729 cents
    expect(result.interestPortionCents).toBe(14729);
    expect(result.principalPortionCents).toBe(100000);
    expect(result.todayAmountCents).toBe(114729);
    expect(result.newOutstandingCents).toBe(300000);

    expect(result.nextDueDate).toEqual(d(2026, 4, 1));
    expect(result.daysFromPayOnToNextDue).toBe(31);

    expect(result.remainingSchedule).toHaveLength(3);
    const [r1, r2, r3] = result.remainingSchedule;
    expect(r1.dueDate).toEqual(d(2026, 4, 1));
    expect(r1.daysInPeriod).toBe(31);
    expect(r1.principalCents).toBe(100000);
    expect(r1.outstandingAfterRowCents).toBe(200000);
    expect(r2.dueDate).toEqual(d(2026, 5, 1));
    expect(r2.daysInPeriod).toBe(30);
    expect(r2.outstandingAfterRowCents).toBe(100000);
    expect(r3.dueDate).toEqual(d(2026, 6, 1));
    expect(r3.daysInPeriod).toBe(31);
    expect(r3.principalCents).toBe(100000);
    expect(r3.outstandingAfterRowCents).toBe(0);
  });

  it("TEST 9: scheduled early payment — Policy X keeps next due date fixed", () => {
    const onTime = calculateScheduledPayment(baseTest8);
    const early = calculateScheduledPayment({
      ...baseTest8,
      payOnDate: d(2026, 2, 22),
    });

    expect(early.days).toBe(21);
    expect(early.interestPortionCents).toBeLessThan(onTime.interestPortionCents);

    // Policy X: next scheduled due date is UNCHANGED even though paid early.
    expect(early.nextDueDate).toEqual(d(2026, 4, 1));
    expect(early.daysFromPayOnToNextDue).toBe(38);

    expect(early.remainingSchedule).toHaveLength(3);
    const [firstEarly] = early.remainingSchedule;
    const [firstOnTime] = onTime.remainingSchedule;
    // First row covers the longer Feb 22 -> Apr 1 stretch (38 days), not 31.
    expect(firstEarly.daysInPeriod).toBe(38);
    expect(firstEarly.interestCents).toBeGreaterThan(firstOnTime.interestCents);
  });

  it("TEST 10: late payment is refused", () => {
    expect(() =>
      calculateScheduledPayment({
        ...baseTest8,
        payOnDate: d(2026, 3, 15),
      }),
    ).toThrow(LatePaymentError);
    expect(() =>
      calculateScheduledPayment({
        ...baseTest8,
        payOnDate: d(2026, 3, 15),
      }),
    ).toThrow(/legacy CRM/);
  });

  it("TEST 11: all instalments already paid is refused", () => {
    expect(() =>
      calculateScheduledPayment({
        ...baseTest8,
        instalmentsAlreadyPaid: 6,
      }),
    ).toThrow(AllInstalmentsPaidError);
    expect(() =>
      calculateScheduledPayment({
        ...baseTest8,
        instalmentsAlreadyPaid: 6,
      }),
    ).toThrow(/All instalments already paid/);
  });

  it("TEST 12: last row absorbs rounding remainder", () => {
    // $1,000 / 3 instalments => auto principal 33333 cents, sum 99999 (short 1).
    // Last row's principal must absorb the +1 to close at exactly 100000.
    expect(autoPrincipalPortionCents(100000, 3)).toBe(33333);

    const result = calculateScheduledPayment({
      outstandingCents: 100000,
      originalPrincipalCents: 100000,
      totalInstalments: 3,
      instalmentsAlreadyPaid: 0,
      rateUnit: "annual",
      ratePercent: 48,
      lastPaymentDate: d(2026, 1, 1),
      payOnDate: d(2026, 2, 1),
      principalPortionCents: 33333,
    });

    expect(result.principalPortionCents).toBe(33333);
    expect(result.remainingSchedule).toHaveLength(2);
    expect(result.remainingSchedule[0].principalCents).toBe(33333);
    expect(result.remainingSchedule[1].principalCents).toBe(33334);
    expect(result.remainingSchedule[1].outstandingAfterRowCents).toBe(0);

    const totalPrincipal =
      result.principalPortionCents +
      result.remainingSchedule.reduce((s, r) => s + r.principalCents, 0);
    expect(totalPrincipal).toBe(100000);
  });
});
