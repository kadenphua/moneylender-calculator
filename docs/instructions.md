Another spec gap. Add a loan start date field to Mode B.

1. Add a new field "Loan start date" to the Mode B form, placed
   between "Original loan principal" and "Total number of
   instalments". Date picker, required.

2. Add the field to the Mode B zod schema as loanStartDate (YYYY-MM-DD
   string, same format as other dates).

3. Add the field to the ScheduledPaymentInput type and to
   ScheduledPaymentRecord in db.ts.

4. Validation: loanStartDate <= lastPaymentDate. If violated, form
   error: "Last payment date cannot be before loan start date."

5. Pass loanStartDate through to the calculation function for
   storage in the result, even though it doesn't affect the math.
   The math itself doesn't change — interest still calculates from
   lastPaymentDate to payOnDate.

6. On the Mode B receipt, add a line in the loan summary block:
       Loan start date:                   01 Jan 2026
   placed immediately above the existing "Total instalments" line.

7. Update the Mode B detail dialog in History.tsx to show the loan
   start date.

8. Update README's Mode B section to list the loan start date as a
   required input.

9. Add one new test:
   TEST 13 — Validation: lastPaymentDate before loanStartDate throws
   a clear error.

   So total tests = 13.

10. Existing tests (1-12) must continue to pass. Add loanStartDate
    to the Mode B test inputs in TEST 8, 9, 10, 11, 12 — use the
    same value as lastPaymentDate would have been BEFORE the first
    payment, or any sensible value earlier than lastPaymentDate.

Add the original repayment schedule to the Mode B output.

1. New helper function in calc.ts:
   generateOriginalSchedule(
     originalPrincipalCents: number,
     totalInstalments: number,
     principalPortionCents: number,
     monthlyRatePercent: number,
     loanStartDate: Date
   ): ScheduleRow[]

   Algorithm:
     For each row i from 1 to totalInstalments:
       dueDate = addMonths(loanStartDate, i)
       outstandingAtStartCents = originalPrincipalCents − (i-1) × principalPortionCents
       interestCents = roundHalfUp(outstandingAtStartCents × monthlyRatePercent / 100)
       principalCents = principalPortionCents (last row absorbs remainder so loan
                         closes exactly at zero)
       totalCents = principalCents + interestCents
       outstandingAfterRowCents = outstandingAtStartCents - principalCents

   This uses MONTHLY rate × outstanding, NOT daily rate × actual days. 
   The original schedule assumes exactly one month per period.

2. Add originalSchedule: ScheduleRow[] to ScheduledPaymentResult.

3. Add originalSchedule to ScheduledPaymentRecord in db.ts.

4. On the screen Mode B result panel, render TWO tables:
   - "Original Schedule (from loan agreement)" — shows all instalments,
     with paid ones marked ✓, the one being paid today marked "← paying
     today", and future ones unmarked.
   - "New Remaining Schedule (recalculated)" — shows only the remaining
     future instalments after today's payment.

5. On the printed receipt for Mode B, render both tables stacked
   vertically. Same status markers (✓ paid, ← paid today). 4 columns
   each: Due / Principal / Interest / Total.

6. Update History.tsx detail dialog to show both schedules.

7. Add one new test:
   TEST 14 — generateOriginalSchedule for $6,000 / 6 instalments / 4%
   monthly produces the canonical schedule:
     Row 1: principal $1,000, interest $240.00, total $1,240.00
     Row 2: principal $1,000, interest $200.00, total $1,200.00
     Row 3: principal $1,000, interest $160.00, total $1,160.00
     Row 4: principal $1,000, interest $120.00, total $1,120.00
     Row 5: principal $1,000, interest  $80.00, total $1,080.00
     Row 6: principal $1,000, interest  $40.00, total $1,040.00
     Sum of all principals = $6,000.00 exactly.

   Total tests now = 14.

8. Update README:
   - Note that Mode B output includes both schedules.
   - Add a warning under "Before deploying to the team": "Also verify
     that the calculator's Original Schedule for one real borrower
     matches the schedule on their Note of Contract to the cent. If
     they differ, the Note of Contract is generated with a different
     convention and the schedule generator needs investigation before
     deploying."

Update the Mode B layout to show the Original Schedule and New
Remaining Schedule side-by-side instead of stacked.

1. On screen (Mode B result panel and History detail dialog):
   - Two tables side-by-side at viewport widths ≥ 768px.
   - Stack vertically below 768px.
   - Use CSS grid or flex with a small gap between them.
   - Each table 3 columns: Due / Interest / Total. Drop the Principal
     column since principal is constant for all rows under Split A.
   - Left table header: "ORIGINAL SCHEDULE (from loan agreement)"
   - Right table header: "NEW REMAINING SCHEDULE (recalculated)"
   - Use the same row markers as before: ✓ paid for past rows,
     "← paying today" for today's row.
   - Past rows in the new-schedule table appear as empty/dim rows
     aligned with the original (so the rows line up visually).
     If aligning is awkward, just show only the future rows in the
     new schedule — whichever is cleaner.

2. On the printed receipt:
   - Same side-by-side layout if @media print width allows.
   - Add `@page { size: A4 landscape; }` in print CSS so receipts
     print in landscape by default — gives more horizontal room.
   - If the side-by-side layout still doesn't fit, fall back to
     stacked with clear "BEFORE" / "AFTER" headings.

3. Below both tables, add a summary line:
       Total saving across remaining schedule: S$80.82
   Compute as: 
       sum of original schedule totals for remaining future rows
       MINUS sum of new schedule totals
   Show only if this is positive (early payment with saving). If
   zero (on-time payment), hide the line.

4. Update README's Mode B section to mention the comparison view
   and the savings summary.

5. No new tests required — the underlying calculations are unchanged.
   Just rendering.

Continue the build.