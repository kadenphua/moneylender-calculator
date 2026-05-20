import { describe, expect, it } from "vitest";
import {
  calculateFullSettlement,
  calculateScheduledPayment,
  centsToDisplay,
  generateOriginalSchedule,
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

describe("Scheduled Payment (Mode B) — annuity amortisation tests", () => {
  // Loan A from the CRM: $1,000 over 6 monthly instalments at 3.25% per
  // month, monthly payment $186.13. Used for tests 8 and 10-12.
  const baseLoanA = {
    originalPrincipalCents: 100000,
    totalInstalments: 6,
    instalmentsAlreadyPaid: 0,
    outstandingCents: 100000,
    rateUnit: "monthly" as const,
    ratePercent: 3.25,
    monthlyPaymentCents: 18613,
    loanStartDate: d(2026, 4, 4),
    lastPaymentDate: d(2026, 4, 4),
    payOnDate: d(2026, 5, 4),
  };

  it("TEST 8: original schedule — Loan A ($1,000 / 6 / $186.13 / 3.25% monthly)", () => {
    const schedule = generateOriginalSchedule(
      100000,
      6,
      18613,
      3.25,
      d(2026, 4, 4),
    );

    expect(schedule).toHaveLength(6);

    const expected = [
      { dueDate: d(2026, 5, 4), principal: 15363, interest: 3250, total: 18613 },
      { dueDate: d(2026, 6, 4), principal: 15862, interest: 2751, total: 18613 },
      { dueDate: d(2026, 7, 4), principal: 16378, interest: 2235, total: 18613 },
      { dueDate: d(2026, 8, 4), principal: 16910, interest: 1703, total: 18613 },
      { dueDate: d(2026, 9, 4), principal: 17460, interest: 1153, total: 18613 },
      { dueDate: d(2026, 10, 4), principal: 18027, interest: 586, total: 18613 },
    ];
    schedule.forEach((row, i) => {
      expect(row.dueDate).toEqual(expected[i].dueDate);
      expect(row.principalCents).toBe(expected[i].principal);
      expect(row.interestCents).toBe(expected[i].interest);
      expect(row.totalCents).toBe(expected[i].total);
    });

    const totalPrincipal = schedule.reduce(
      (sum, row) => sum + row.principalCents,
      0,
    );
    expect(totalPrincipal).toBe(100000);
    expect(schedule[5].outstandingAfterRowCents).toBe(0);
  });

  it("TEST 9: original schedule — Loan B ($5,000 / 12 / $509.84 / 3.25% monthly); last row absorbs $0.06 remainder", () => {
    const schedule = generateOriginalSchedule(
      500000,
      12,
      50984,
      3.25,
      d(2026, 4, 21),
    );

    expect(schedule).toHaveLength(12);

    const expected = [
      { principal: 34734, interest: 16250, total: 50984 },
      { principal: 35863, interest: 15121, total: 50984 },
      { principal: 37028, interest: 13956, total: 50984 },
      { principal: 38232, interest: 12752, total: 50984 },
      { principal: 39474, interest: 11510, total: 50984 },
      { principal: 40757, interest: 10227, total: 50984 },
      { principal: 42082, interest: 8902, total: 50984 },
      { principal: 43450, interest: 7534, total: 50984 },
      { principal: 44862, interest: 6122, total: 50984 },
      { principal: 46320, interest: 4664, total: 50984 },
      { principal: 47825, interest: 3159, total: 50984 },
      // Last row absorbs the cumulative cent rounding remainder — total is
      // $509.78, six cents short of the constant monthly payment.
      { principal: 49373, interest: 1605, total: 50978 },
    ];
    schedule.forEach((row, i) => {
      expect(row.principalCents).toBe(expected[i].principal);
      expect(row.interestCents).toBe(expected[i].interest);
      expect(row.totalCents).toBe(expected[i].total);
    });

    const totalPrincipal = schedule.reduce(
      (sum, row) => sum + row.principalCents,
      0,
    );
    expect(totalPrincipal).toBe(500000);
    expect(schedule[11].outstandingAfterRowCents).toBe(0);
  });

  it("TEST 10: on-time scheduled payment — first instalment of Loan A", () => {
    const result = calculateScheduledPayment(baseLoanA);

    expect(result.days).toBe(30);
    expect(result.daysInScheduledMonth).toBe(30);
    expect(result.prorationFactor).toBe(1);
    expect(result.scheduledInterestCents).toBe(3250);
    expect(result.interestPortionCents).toBe(3250);
    expect(result.principalPortionCents).toBe(15363);
    expect(result.todayAmountCents).toBe(18613);
    expect(result.newOutstandingCents).toBe(84637);
  });

  it("TEST 11: early payment (7 days early) — interest prorated, principal unchanged", () => {
    const result = calculateScheduledPayment({
      ...baseLoanA,
      payOnDate: d(2026, 4, 27),
    });

    expect(result.days).toBe(23);
    expect(result.daysInScheduledMonth).toBe(30);
    expect(result.prorationFactor).toBeCloseTo(23 / 30, 10);
    expect(result.scheduledInterestCents).toBe(3250);
    // roundHalfUp(3250 × 23/30) = roundHalfUp(2491.666...) = 2492
    expect(result.interestPortionCents).toBe(2492);
    expect(result.principalPortionCents).toBe(15363);
    expect(result.todayAmountCents).toBe(17855);
    expect(result.newOutstandingCents).toBe(84637);
  });

  it("TEST 12: same-day payment — 0 days, prorated interest = 0", () => {
    const result = calculateScheduledPayment({
      ...baseLoanA,
      payOnDate: d(2026, 4, 4),
    });

    expect(result.days).toBe(0);
    expect(result.prorationFactor).toBe(0);
    expect(result.scheduledInterestCents).toBe(3250);
    expect(result.interestPortionCents).toBe(0);
    expect(result.principalPortionCents).toBe(15363);
    expect(result.todayAmountCents).toBe(15363);
    expect(result.newOutstandingCents).toBe(84637);
  });

  it("TEST 13: lastPaymentDate before loanStartDate must throw", () => {
    expect(() =>
      calculateScheduledPayment({
        ...baseLoanA,
        loanStartDate: d(2026, 5, 1),
        lastPaymentDate: d(2026, 4, 1),
      }),
    ).toThrow(/Last payment date cannot be before loan start date/);
  });

  it("TEST 14: payOnDate > addMonths(lastPayment, 1) must throw LatePaymentError", () => {
    expect(() =>
      calculateScheduledPayment({
        ...baseLoanA,
        payOnDate: d(2026, 5, 15),
      }),
    ).toThrow(LatePaymentError);
    expect(() =>
      calculateScheduledPayment({
        ...baseLoanA,
        payOnDate: d(2026, 5, 15),
      }),
    ).toThrow(/legacy CRM/);
  });
});
