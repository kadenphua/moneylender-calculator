# Edge-case scenario report

Generated 2026-05-20T09:18:45.567Z via `scripts/edge-cases.ts`.

**Diagnostic only.** This report surfaces scenarios not covered by the 14 acceptance tests. Do **not** change production code based on findings here without an explicit follow-up decision.


## A1. Mode B end-of-month — Jan 31 loan start, Feb 28 pay-on

**Scenario:** Loan starts on a 31st. The 'one month later' due date is clamped by Feb. Verify the output's nextDueDate and look for any drift between the Original Schedule (anchored to loanStartDate) and the New Remaining Schedule (chained via addMonths(prev, 1)).

**Inputs:**
- **originalPrincipal:** $6,000.00
- **totalInstalments:** 6
- **instalmentsAlreadyPaid:** 0
- **outstanding:** $6,000.00
- **rate:** 48% per year
- **loanStartDate:** 2026-01-31
- **lastPaymentDate:** 2026-01-31
- **payOnDate:** 2026-02-28 (the clamped 'one month later')
- **principalPortion:** $1,000.00

**Expected behaviour:** Not late (payOn equals todaysScheduledDate = addMonths(Jan 31, 1) = Feb 28). nextDueDate = addMonths(Jan 31, 2) = Mar 31. Original Schedule due dates should alternate 28/31/30/31/30/31 (anchored). New Remaining Schedule chains addMonths(prev, 1) — may drift off the anchored dates from April onward.

**Actual:**
```
days: 28
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $220.93 (22093c)
todayAmount: $1,220.93
newOutstanding: $5,000.00
nextDueDate: 2026-03-31
daysFromPayOnToNextDue: 31
```
Original schedule:
```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2026-02-28 |   28 |  $1,000.00 |    $240.00 |  $1,240.00 |  $5,000.00
2   | 2026-03-31 |   31 |  $1,000.00 |    $200.00 |  $1,200.00 |  $4,000.00
3   | 2026-04-30 |   30 |  $1,000.00 |    $160.00 |  $1,160.00 |  $3,000.00
4   | 2026-05-31 |   31 |  $1,000.00 |    $120.00 |  $1,120.00 |  $2,000.00
5   | 2026-06-30 |   30 |  $1,000.00 |     $80.00 |  $1,080.00 |  $1,000.00
6   | 2026-07-31 |   31 |  $1,000.00 |     $40.00 |  $1,040.00 |      $0.00
```
New remaining schedule:
```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2026-03-31 |   31 |  $1,000.00 |    $203.84 |  $1,203.84 |  $4,000.00
2   | 2026-04-30 |   30 |  $1,000.00 |    $157.81 |  $1,157.81 |  $3,000.00
3   | 2026-05-30 |   30 |  $1,000.00 |    $118.36 |  $1,118.36 |  $2,000.00
4   | 2026-06-30 |   31 |  $1,000.00 |     $81.53 |  $1,081.53 |  $1,000.00
5   | 2026-07-30 |   30 |  $1,000.00 |     $39.45 |  $1,039.45 |      $0.00
```

**Verdict:** FLAG — New Remaining Schedule drifts off the Original Schedule's anchored dates. Mismatches — row 3: new=2026-05-30 vs original=2026-05-31; row 5: new=2026-07-30 vs original=2026-07-31.


## A2. Mode B original schedule — Jan 31 loan start, 6 instalments

**Scenario:** Confirm date-fns clamping behaviour for an end-of-month-anchored schedule. Each row's due date is `addMonths(loanStartDate, i)`.

**Inputs:** originalPrincipal $6,000, 6 instalments, principalPortion $1,000, monthlyRate 4%, loanStartDate 2026-01-31.

**Expected behaviour:** Due dates alternate between end-of-month values that exist in the target month (28 Feb 2026 is not a leap year; April/June have 30 days).

```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2026-02-28 |   28 |  $1,000.00 |    $240.00 |  $1,240.00 |  $5,000.00
2   | 2026-03-31 |   31 |  $1,000.00 |    $200.00 |  $1,200.00 |  $4,000.00
3   | 2026-04-30 |   30 |  $1,000.00 |    $160.00 |  $1,160.00 |  $3,000.00
4   | 2026-05-31 |   31 |  $1,000.00 |    $120.00 |  $1,120.00 |  $2,000.00
5   | 2026-06-30 |   30 |  $1,000.00 |     $80.00 |  $1,080.00 |  $1,000.00
6   | 2026-07-31 |   31 |  $1,000.00 |     $40.00 |  $1,040.00 |      $0.00
```

**Verdict:** OK — Anchored generation produces the expected 28/31/30/31/30/31 alternation; no drift.


## B1. Mode A across leap day — Feb 15 to Mar 15, 2028

**Scenario:** 2028 is a leap year, so Feb has 29 days. Verify days = 29.

**Inputs:** outstanding $1,000.00, rate 48% per year, lastPayment 2028-02-15, payOn 2028-03-15, no late fee.

```
days: 29
dailyRate: 0.001315068493150685
interest: $38.14 (3814c)
total: $1,038.14
```

**Verdict:** OK — days = 29 (29 calendar days across Feb 15 → Mar 15 in a leap year). Interest = $38.14, total $1,038.14.


## B2. Mode B original schedule — Jan 1, 2028 leap year

**Scenario:** Check whether the Feb→Mar period in the original schedule reflects 29 days. The interest in the original schedule is `outstanding × monthly% / 100`, not days × daily rate, so leap day does not change the interest amount — only `daysInPeriod` may differ.

**Inputs:** originalPrincipal $6,000, 6 instalments, principalPortion $1,000, monthlyRate 4%, loanStartDate 2028-01-01.

```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2028-02-01 |   31 |  $1,000.00 |    $240.00 |  $1,240.00 |  $5,000.00
2   | 2028-03-01 |   29 |  $1,000.00 |    $200.00 |  $1,200.00 |  $4,000.00
3   | 2028-04-01 |   31 |  $1,000.00 |    $160.00 |  $1,160.00 |  $3,000.00
4   | 2028-05-01 |   30 |  $1,000.00 |    $120.00 |  $1,120.00 |  $2,000.00
5   | 2028-06-01 |   31 |  $1,000.00 |     $80.00 |  $1,080.00 |  $1,000.00
6   | 2028-07-01 |   30 |  $1,000.00 |     $40.00 |  $1,040.00 |      $0.00
```

**Verdict:** OK — Row 2 (due 2028-03-01) reports daysInPeriod = 29, matching the leap February. Interest amount is unaffected because the original-schedule formula uses monthly rate × outstanding.


## C1. Mode A extreme small — $0.01 outstanding, 48% annual, 100 days

**Scenario:** Sub-penny interest accrual on a one-cent loan. Confirm interest rounds sensibly and total ≥ principal.

**Inputs:** outstanding $0.01 (1 cent), rate 48% per year, 100 days (lastPayment 2026-01-01, payOn 2026-04-11), no late fee.

```
days: 100
dailyRate: 0.001315068493150685
interest: $0.00 (0c)
total: $0.01
```
Unrounded interest in cents (before half-up): 0.131507

**Verdict:** OK — Interest rounds to 0 cents — accrual is below the half-up threshold (≈0.13¢). Total = $0.01 = principal. Mathematically correct but a pedant might point out: the borrower effectively gets a 100-day interest-free pico-loan whenever outstanding × dailyRate × days < 0.5¢. This is intrinsic to integer-cent precision.


## C2. Mode A extreme large — $1,000,000 outstanding, 48% annual, 30 days

**Scenario:** Confirm no floating-point precision issues at large notionals. Outstanding is 100,000,000 cents; well within JS's 2^53 safe-integer range, but float ops can still drift if poorly ordered.

**Inputs:** outstanding $1,000,000.00, rate 48% per year, lastPayment 2026-05-01, payOn 2026-05-31 (30 days), no late fee.

Unrounded interest in cents: 3945205.4794520554
```
days: 30
dailyRate: 0.001315068493150685
interest: $39,452.05 (3945205c)
total: $1,039,452.05
```

**Verdict:** OK — Interest = $39,452.05 (3945205c), an integer. Unrounded value was 3945205.479452c. No precision drift.


## C3. Mode B original schedule — $100,000 / 24 instalments

**Scenario:** Confirm large-N original schedule generates without error and totals reconcile.

**Inputs:** originalPrincipal $100,000.00, 24 instalments, auto principal, 4% monthly, loanStartDate 2026-01-01.

autoPrincipalPortionCents(10000000, 24) = 416667 ($4,166.67)
Rows: 24, sum of principals: $100,000.00, last row outstandingAfter: $0.00

**Verdict:** OK — 24 rows, principal sum closes to exactly $100,000.00, final outstanding = $0.


## D1. Mode B — 1 total instalment, 0 already paid

**Scenario:** Single-instalment loan paid in full as the first scheduled payment. Should produce an empty remainingSchedule and a one-row originalSchedule. newOutstanding = 0.

**Inputs:** originalPrincipal $1,000, 1 instalment, 0 paid, outstanding $1,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-02-01 (= todaysScheduledDate), principalPortion $1,000.

```
days: 31
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $40.77 (4077c)
todayAmount: $1,040.77
newOutstanding: $0.00
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 28
```
Original schedule:
```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2026-02-01 |   31 |  $1,000.00 |     $40.00 |  $1,040.00 |      $0.00
```
New remaining schedule:
```
(empty)
```

**Verdict:** OK — 1-row original schedule, empty remaining schedule, newOutstanding = $0. Loan closes in one payment as expected.


## D2. Mode B — 24 total instalments, 0 already paid

**Scenario:** Stress the engine with a 24-instalment loan from scratch. originalSchedule should be 24 rows, remainingSchedule 23, last row outstandingAfter = 0.

**Inputs:** originalPrincipal $24,000, 24 instalments, 0 paid, outstanding $24,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-02-01, principalPortion $1,000.

```
days: 31
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $978.41 (97841c)
todayAmount: $1,978.41
newOutstanding: $23,000.00
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 28
```
originalSchedule rows: 24
remainingSchedule rows: 23
Last remaining row outstandingAfter: $0.00

**Verdict:** OK — 24-row original, 23-row remaining, final outstanding = $0. No errors, no overflow.


## E1. Mode B rounding — $1,000 / 7 instalments

**Scenario:** $1,000 / 7 gives 142.857… cents per instalment, rounding to 14286 cents per row. 7 × 14286 = 100,002 cents — over by 2 cents. The last row must absorb the negative remainder so the loan closes at exactly $0.

autoPrincipalPortionCents(100000, 7) = 14286 cents ($142.86)
```
days: 31
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $40.77 (4077c)
todayAmount: $183.63
newOutstanding: $857.14
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 28
```
Original schedule:
```
#   | Due        | Days |  Principal |   Interest |      Total |      After
---------------------------------------------------------------------------
1   | 2026-02-01 |   31 |    $142.86 |     $40.00 |    $182.86 |    $857.14
2   | 2026-03-01 |   28 |    $142.86 |     $34.29 |    $177.15 |    $714.28
3   | 2026-04-01 |   31 |    $142.86 |     $28.57 |    $171.43 |    $571.42
4   | 2026-05-01 |   30 |    $142.86 |     $22.86 |    $165.72 |    $428.56
5   | 2026-06-01 |   31 |    $142.86 |     $17.14 |    $160.00 |    $285.70
6   | 2026-07-01 |   30 |    $142.86 |     $11.43 |    $154.29 |    $142.84
7   | 2026-08-01 |   31 |    $142.84 |      $5.71 |    $148.55 |      $0.00
```
All principals (today + remaining): $142.86, $142.86, $142.86, $142.86, $142.86, $142.86, $142.84
Sum of principals: $1,000.00 (must equal $1,000.00)
Last remaining row principal: $142.84 (auto was $142.86)
Original schedule last row principal: $142.84

**Verdict:** OK — Total principal closes to exactly $1,000.00. Last remaining row's principal = $142.84 = auto − 2¢. Officers may find a "less than auto" last row counter-intuitive — worth a UI hint, not a bug.


## E2. Mode B rounding — $999.99 / 3 instalments

**Scenario:** 99,999 ÷ 3 = 33,333 exactly. No rounding remainder. Confirm sums.

autoPrincipalPortionCents(99999, 3) = 33333 cents ($333.33)
Total principal: $999.99 (must equal $999.99 = 99999¢)

**Verdict:** OK — Clean three-way split, no remainder, sums to exactly $999.99.


## F1. Mode A same-day — outstanding $1,000, days = 0

**Scenario:** Borrower settles on the same calendar day as the last payment. Days = 0, interest = 0, total = principal.

```
days: 0
dailyRate: 0.001315068493150685
interest: $0.00 (0c)
total: $1,000.00
```

**Verdict:** OK — Days = 0, interest = 0, total = $1,000.00 exactly.


## F2. Mode B last instalment — outstanding equals principalPortion

**Scenario:** Today's payment is the final scheduled instalment. After today, newOutstanding = 0 and remainingSchedule should be empty.

**Inputs:** originalPrincipal $6,000, 6 instalments, instalmentsAlreadyPaid = 5, outstanding $1,000, principalPortion $1,000, rate 48% annual, loanStartDate 2025-08-01, lastPaymentDate 2026-01-01, payOn 2026-02-01.

```
days: 31
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $40.77 (4077c)
todayAmount: $1,040.77
newOutstanding: $0.00
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 28
```
remainingSchedule rows: 0

**Verdict:** OK — newOutstanding = $0, remainingSchedule is empty. nextDueDate (2026-03-01) is still emitted even though no future rows reference it — a minor UI consideration for "last payment" displays, not a bug.


## G1. Mode A rate boundary — 0.01% per year, 30 days

**Scenario:** Tiny rate. Confirm interest computes without underflow (it may legitimately round to 0).

```
days: 30
dailyRate: 2.73972602739726e-7
interest: $0.01 (1c)
total: $1,000.01
```
Unrounded interest in cents: 0.821918

**Verdict:** OK — Unrounded 0.821918c rounds half-up to 1¢. Total = $1,000.01. Engine handles very-low-rate accrual correctly; no underflow.


## G2. Mode A rate boundary — 999% per year, 30 days

**Scenario:** Just under the validation ceiling of 1000%. Confirm no overflow.

```
days: 30
dailyRate: 0.02736986301369863
interest: $821.10 (82110c)
total: $1,821.10
```

**Verdict:** OK — Interest = $821.10, total $1,821.10. No overflow, no precision drift.


## H1. Mode B early extreme — paid 1 day after loan start

**Scenario:** Officer pays the first instalment 30 days early. Days = 1, today's interest tiny, but the first remaining row covers a 58-day stretch.

**Inputs:** originalPrincipal $6,000, 6 instalments, 0 paid, outstanding $6,000, rate 48% annual, loanStartDate 2026-01-01, lastPaymentDate 2026-01-01, payOn 2026-01-02, principalPortion $1,000.

```
days: 1
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $7.89 (789c)
todayAmount: $1,007.89
newOutstanding: $5,000.00
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 58
```
First remaining row: 58 days, interest $381.37

**Verdict:** OK — days = 1 (tiny today's interest = $7.89). First remaining row spans 58 days (Jan 2 → Mar 1) and accrues $381.37 of interest — about 2× a "normal" 30-day row's interest at this rate. Math is per spec, but borrowers may be surprised to see the next row's interest jump after paying so early. UI / training consideration, not a bug.


## H2. Mode B — paid 1 day before todaysScheduledDate (Jan 31)

**Scenario:** Borrower pays the day before the due date (Feb 1). Days = 30, still on-time.

```
days: 30
dailyRate: 0.001315068493150685
monthlyRatePercent: 4
interestPortion: $236.71 (23671c)
todayAmount: $1,236.71
newOutstanding: $5,000.00
nextDueDate: 2026-03-01
daysFromPayOnToNextDue: 29
```

**Verdict:** OK — Accepted as on-time. days = 30, daysFromPayOnToNextDue = 29 (Jan 31 → Mar 1).


## Summary — flagged items

- **A1**: New Remaining Schedule drifts off the Original Schedule's anchored dates. Mismatches — row 3: new=2026-05-30 vs original=2026-05-31; row 5: new=2026-07-30 vs original=2026-07-31.

---
_End of report. Do not change production code based on these findings without an explicit follow-up._
