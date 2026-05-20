STAGE 2 — SCHEDULED INSTALMENT (EARLY PAYMENT) CALCULATOR

Adds Mode B to the existing Full Settlement Calculator. Stage 1 (Mode A
— full settlement) is already built and must not be broken. Stage 2 only
handles ON-TIME and EARLY payments of a single scheduled instalment.
LATE payments are explicitly OUT OF SCOPE — the legacy CRM handles those.

This is an extension of the existing project, not a new project. The
working directory and all existing files remain. New code adds to
src/lib/calc.ts, adds new components, and extends App.tsx to wire in a
new tab or mode toggle. The Stage 1 acceptance tests must still pass.

LOCKED SPECIFICATION

Loan model (unchanged from Stage 1):
- Reducing balance, interest on outstanding only.
- Daily rate: annual / 365 (or monthly × 12 / 365). Same helpers as Stage 1.
- Day counting: exclusive on both ends via differenceInCalendarDays.
- Rounding: integer cents, half-up. Same helper roundHalfUp.

New inputs Stage 2 needs:
- Borrower reference (optional, max 50 chars) — same as Stage 1.
- Original loan principal (dollars).
- Total number of instalments (integer ≥ 1).
- Instalments already paid (integer ≥ 0 and < total).
- Outstanding principal as of last payment (Plan approved. All five ambiguities resolved as follows:

1. nextDueDate (output field) = first future row's due date = 
   lastPaymentDate + 2 months. The lateness threshold used for 
   validation is a SEPARATE date = lastPaymentDate + 1 month (the 
   instalment being paid today). Name the validation date something 
   different internally — e.g. todaysInstalmentDueDate or 
   latenessThreshold — to avoid the conflation in my spec.

2. TEST 8 interest = 14729 cents = $147.29. My spec wrote "147.287" 
   which was meant to be cents-with-fractional-precision before 
   rounding, not dollars. Your reading is correct.

3. End-of-month handling: accept date-fns default clamping. Don't 
   add custom day-of-month preservation logic.

4. Late payment is strict-greater-than (payOn > latenessThreshold). 
   Paying on the due date itself is on-time. Confirmed.

5. TEST 12 instalmentsAlreadyPaid = 0. Confirmed.

All five silent defaults accepted, including the dirty-field tracking 
for the principal portion auto-fill.

Proceed with Step 1 (calc engine + 5 tests). Stop and report when 
all 12 tests pass before moving to UI work.dollars).
- Interest rate + per-month / per-year toggle (default per year) — same
  as Stage 1.
- Last payment date.
- Pay-on date (today or future).
- Principal portion per instalment — AUTO-CALCULATED as
    roundHalfUp((originalPrincipalCents) / totalInstalments)
  but EDITABLE by the officer if rounding remainder needs to be allocated
  differently. Display the auto value below the field as a hint:
  "(auto: $1,000.00 — change if rounding differs)".

VALIDATION RULES

Compute the next scheduled due date as:
  nextDueDate = lastPaymentDate + 1 month (using date-fns addMonths)

If payOnDate > nextDueDate:
  Refuse the calculation. Display a prominent error message:
    "This is a late payment. Please use the legacy CRM for late
     payment calculations. This calculator handles on-time and
     early payments only."
  Do NOT save anything to history. Do NOT show a result.

Other validation:
- originalPrincipal > 0
- totalInstalments ≥ 1
- instalmentsAlreadyPaid ≥ 0 AND < totalInstalments
  (if ≥ totalInstalments, the loan is fully paid — refuse with message
   "All instalments already paid. No further scheduled payment is due.")
- outstanding > 0
- rate > 0 and < 1000
- principalPortion > 0 and ≤ outstanding
- payOnDate ≥ lastPaymentDate

CALCULATION — ON-TIME OR EARLY PAYMENT

  days = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate = annual_rate / 100 / 365   [or monthly × 12 / 365]
  interestPortionCents = roundHalfUp(outstandingCents × dailyRate × days)
  todayAmountCents = principalPortionCents + interestPortionCents
  newOutstandingCents = outstandingCents − principalPortionCents

REMAINING SCHEDULE — Policy X (fixed due dates)

After the early/on-time payment, compute the remaining schedule.
The remaining schedule has (totalInstalments − instalmentsAlreadyPaid − 1)
rows. Each row represents one future instalment.

For the FIRST future row (the one immediately after today's payment):
  Its due date is the next scheduled due date (lastPaymentDate + 1 month
  from the ORIGINAL schedule, NOT from today's pay-on date — this is
  Policy X).
  Interest covers the actual days from payOnDate to that due date.
  This will typically be MORE than a standard 30-day period if today's
  payment was early — flag this to the officer (see UI below).

For each subsequent future row:
  Due date = previous row's due date + 1 month (addMonths).
  Days for interest = differenceInCalendarDays(thisDueDate, previousDueDate)
                    — exclusive count, will be 28–31 days depending on month.
  Interest = roundHalfUp(remainingOutstandingCents × dailyRate × days).
  Principal = principalPortionCents (same as today's portion).
  Total for this row = principal + interest.
  Decrement remainingOutstanding by principal portion after this row.

LAST ROW HANDLING:
  Because principalPortion may be rounded, the last row may need to
  absorb a few cents of remainder so the loan closes exactly at zero.
  In the last row, set principal = remainingOutstandingCents (whatever's
  left), recompute total accordingly.

OUTPUT

Return a ScheduledPaymentResult object with:
  days: number                          — days for today's payment
  dailyRate: number
  principalPortionCents: number         — what officer entered (or auto)
  interestPortionCents: number          — for today
  todayAmountCents: number              — principal + interest today
  newOutstandingCents: number           — after today's payment
  nextDueDate: Date                     — the next scheduled date
  daysFromPayOnToNextDue: number        — for UI hint
  remainingSchedule: ScheduleRow[]      — array as described above

ScheduleRow:
  rowNumber: number                     — 1-indexed, where 1 is the next future row
  dueDate: Date
  daysInPeriod: number
  principalCents: number
  interestCents: number
  totalCents: number
  outstandingAfterRowCents: number

UI

Add Mode B to the existing Calculator tab. Top of the form gets a mode
selector — two large buttons or a segmented control:

  [ Full Settlement ]  [ Scheduled Payment (Early) ]

Switching modes resets the form. Mode A's form is exactly what's there
today. Mode B's form has the Stage 2 fields above.

Mode B result panel shows:
  Days elapsed (since last payment):  21
  Daily rate:                          0.131507%
  ─────────────────────────────────────
  Principal portion:                  $1,000.00
  Interest portion:                   $66.28
  ─────────────────────────────────────
  TODAY'S AMOUNT:                     $1,066.28   (large, bold)

  New outstanding after this payment: $3,000.00
  Next due date:                      01 Apr 2026
  Days from today to next due date:   31 days
  ─────────────────────────────────────
  REMAINING SCHEDULE (3 instalments):
  ┌────────┬─────────────┬───────────┬──────────┬────────────┐
  │ Due    │ Days        │ Principal │ Interest │ Total      │
  ├────────┼─────────────┼───────────┼──────────┼────────────┤
  │ 01 Apr │ 31 days     │ $1,000.00 │ $101.92  │ $1,101.92  │
  │ 01 May │ 30 days     │ $1,000.00 │ $65.75   │ $1,065.75  │
  │ 01 Jun │ 31 days     │ $1,000.00 │ $33.97   │ $1,033.97  │
  └────────┴─────────────┴───────────┴──────────┴────────────┘

Action buttons: [Print Receipt]  [New Calculation]

PRINT RECEIPT FOR MODE B

Extend the existing PrintReceipt component. When the record is Mode B,
the receipt shows:

  [Company name]
  SCHEDULED PAYMENT QUOTATION (Early/On-time)
  Date: 22 May 2026 14:32
  Officer: [name]
  Borrower ref: [ref]
  Receipt ID: [short uuid]
  ─────────────────────────────────────
  Original loan principal:           S$6,000.00
  Total instalments:                 6
  Instalments already paid:          2
  Outstanding principal:             S$4,000.00
  Last payment date:                 01 Mar 2026
  Pay-on date (today):               22 Mar 2026
  Interest rate:                     48.00% per year
                                     (0.131507% per day)
  Days since last payment:           21
  ─────────────────────────────────────
  Principal portion:                 S$1,000.00
  Interest portion:                  S$66.28
  ─────────────────────────────────────
  TODAY'S AMOUNT:                    S$1,066.28
  ─────────────────────────────────────
  Outstanding after this payment:    S$3,000.00

  REMAINING SCHEDULE
  ┌────────┬───────────┬──────────┬───────────┐
  │ Due    │ Principal │ Interest │ Total     │
  ├────────┼───────────┼──────────┼───────────┤
  │ 01 Apr │ S$1,000   │ S$101.92 │ S$1,101.92│
  │ 01 May │ S$1,000   │ S$65.75  │ S$1,065.75│
  │ 01 Jun │ S$1,000   │ S$33.97  │ S$1,033.97│
  └────────┴───────────┴──────────┴───────────┘

  Note: Schedule recalculated based on actual payment date.
  ─────────────────────────────────────
  Signature: ______________________

AUDIT LOG (extend existing)

CalculationRecord now has a "mode" field: 'fullSettlement' | 'scheduled'.
Mode B records store all Mode B inputs + outputs (including the full
remaining schedule). History tab shows mode as a column. Existing Mode A
records remain compatible (default mode = 'fullSettlement' for older
records via a migration in db.ts).

ACCEPTANCE TESTS — add to src/lib/calc.test.ts

These extend the existing 7 tests. The Stage 1 tests must still pass.

TEST 8 — Scheduled on-time, even principal
  Inputs:
    originalPrincipal = $6,000
    totalInstalments = 6
    instalmentsAlreadyPaid = 2
    outstanding = $4,000
    rate = 48% per year
    lastPayment = 2026-02-01
    payOn = 2026-03-01
    principalPortion = $1,000 (auto-calc match)
  Expected:
    days = 28 (Feb 2026, exclusive)
    interest = roundHalfUp(400000 × (0.48/365) × 28)
             = roundHalfUp(147.287...) → check exact value
    todayAmount = principal + interest
    newOutstanding = 300000 cents
    nextDueDate = 2026-04-01
    daysFromPayOnToNextDue = 31
    remainingSchedule has 3 rows: Apr 1, May 1, Jun 1
    Last row outstanding after = 0

TEST 9 — Scheduled early payment (paid 7 days before due date)
  Inputs: same as TEST 8 but payOn = 2026-02-22
  Expected:
    days = 21
    interest = lower than TEST 8
    nextDueDate = 2026-04-01 (Policy X — UNCHANGED from TEST 8)
    daysFromPayOnToNextDue = 38 (longer than a normal month)
    First row in remainingSchedule has daysInPeriod = 38, NOT 31
    Interest on first remaining row therefore HIGHER than TEST 8's first
    remaining row.

TEST 10 — Late payment refused
  Inputs: same as TEST 8 but payOn = 2026-03-15 (after next due 2026-03-01)
  Expected: function throws clear error about late payment / legacy CRM.

TEST 11 — All instalments already paid
  Inputs: same but instalmentsAlreadyPaid = 6
  Expected: function throws clear error.

TEST 12 — Last row absorbs rounding remainder
  Inputs: originalPrincipal = $1,000, totalInstalments = 3
  principalPortion auto = $333.33 (33333 cents).
  3 × 33333 = 99999 cents, off by 1 cent from 100000.
  Expected: last row's principal = 33334 cents, others = 33333 cents.
  Total principal across all rows + today = exactly 100000 cents.

CONSTRAINTS

- Mode B is added IN ADDITION to Mode A. Mode A must not be broken.
- All Stage 1 acceptance tests must still pass after the changes.
- All new code in TypeScript strict mode, no any.
- No new external dependencies unless absolutely necessary.
- Reuse existing helpers (roundHalfUp, dollarsToCents, centsToDisplay,
  centsToReceiptDisplay, annualToDaily, monthlyToDaily, daysBetween).

STEPS

1. Extend src/lib/calc.ts with the Mode B function + types.
2. Add TEST 8–12 to src/lib/calc.test.ts. Run pnpm test. All 12 tests
   must pass.
3. Extend src/lib/types.ts with the mode field and Mode B inputs/outputs.
4. Add a migration in src/lib/db.ts that defaults legacy records to
   mode='fullSettlement'.
5. Extend src/lib/schema.ts with a Mode B zod schema.
6. Extend src/components/Calculator.tsx with a mode selector at the top
   and a Mode B form below.
7. Extend src/components/PrintReceipt.tsx to render the Mode B receipt
   layout including the schedule table.
8. Extend src/components/History.tsx to show mode as a column and render
   the Mode B detail dialog correctly.
9. Update README.md with Mode B description, the 5 new test cases for
   the accountant, and a warning that the legacy CRM must still be used
   for late payments.
10. Commit at: after calc.ts + tests passing, after UI bundle, after
    README. Local commits only, no remote push.

STOPPING POINT

When all 12 tests pass and the dev server serves Mode B without errors,
stop and report:
- Repo state and commits
- The 5 new test cases for the accountant
- Anything you resolved as a silent default — list it
- Anything in the spec that was ambiguous and you need confirmation on