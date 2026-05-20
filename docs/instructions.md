Rebuild Mode B math to match the CRM's annuity model.

Stage 1 (Mode A — full settlement) is unchanged. Only Mode B is affected.

CURRENT (WRONG) MODEL — Mode B uses Split A (equal principal each
month). The calculator derives the principal portion from
originalPrincipal / totalInstalments and computes interest based
on daily-rate × outstanding × actual days.

NEW (CORRECT) MODEL — Mode B uses standard amortisation against
a constant monthly payment (annuity-style). The monthly payment
is an INPUT, not a computed value, because the CRM's formula for
computing it from first principles is unknown.

LOCKED SPECIFICATION

Inputs to Mode B (the form):
- Borrower reference (optional, unchanged)
- Original loan principal (dollars)
- Loan start date
- Total number of instalments
- Instalments already paid
- Outstanding principal as of last payment (dollars)
- Interest rate + per-month / per-year toggle (default per-month
  now, since the CRM convention is monthly)
- Monthly payment amount (dollars) — NEW FIELD, REQUIRED
- Last payment date
- Pay-on date

REMOVED FIELDS:
- "Principal portion per instalment" — DELETED. Principal portion
  is no longer constant; it is derived per row.

PER-ROW AMORTISATION FORMULA (the core of the new model)

For each scheduled instalment:

  interestCents = roundHalfUp(outstandingCents × monthlyRate / 100)
  principalCents = monthlyPaymentCents - interestCents
  totalCents     = monthlyPaymentCents   (constant for every row
                                          except the last)
  outstandingAfter = outstandingCents - principalCents

The LAST row absorbs any rounding remainder:
  - Compute interest as above
  - Set principal = outstandingCents (whatever is left)
  - Set total = principal + interest (may differ from
    monthlyPaymentCents by a few cents)
  - outstandingAfter = 0

MONTHLY RATE CONVERSION

If rateUnit === 'annual', the monthly rate used per row is
  ratePercent / 12.
If rateUnit === 'monthly', the monthly rate used per row is
  ratePercent directly.

The original Stage 1 daily-rate formulas (annualToDaily and
monthlyToDaily) remain in calc.ts for Mode A's use — do not remove
them.

ORIGINAL SCHEDULE — REWRITE

generateOriginalSchedule takes:
  originalPrincipalCents
  totalInstalments
  monthlyPaymentCents       (replaces principalPortionCents)
  monthlyRatePercent
  loanStartDate

It produces totalInstalments rows. Each row's dueDate is
addMonths(loanStartDate, i+1). Each row's per-row math follows
the amortisation formula above. The last row absorbs remainder.

NEW REMAINING SCHEDULE — REWRITE

After today's payment is computed (see below), the remaining
schedule is generated for rows numbered (instalmentsAlreadyPaid+2)
through totalInstalments. Each row's dueDate is anchored to
addMonths(loanStartDate, rowNumber). Each row's interest is
computed from the previous row's outstanding × monthlyRate, NOT
from daily rate × actual days. The amortisation math is identical
to the original schedule — the only difference between the original
and remaining schedules is the starting outstanding value (new
outstanding after today's payment, instead of the original
principal).

This means: under this new model, the new remaining schedule will
generally match the original schedule rows from the same point
onward, UNLESS the borrower paid early and the early payment
reduced principal more than the original schedule assumed at that
point. In practice, the new remaining schedule and the
corresponding rows of the original schedule will differ slightly
because early payment changes the outstanding balance at each row.

TODAY'S PAYMENT (the early-payment math)

For the early/on-time payment being made today:

  daysSinceLastPayment = differenceInCalendarDays(payOnDate, lastPaymentDate)
  daysInScheduledMonth = differenceInCalendarDays(
                            addMonths(lastPaymentDate, 1),
                            lastPaymentDate
                         )
  prorationFactor = daysSinceLastPayment / daysInScheduledMonth

  scheduledInterestCents = roundHalfUp(outstandingCents × monthlyRate / 100)
  proratedInterestCents = roundHalfUp(scheduledInterestCents × prorationFactor)

  principalPortionCents = monthlyPaymentCents - scheduledInterestCents
                          (i.e., the principal portion the borrower
                           WOULD have paid if on time)

  todayAmountCents = principalPortionCents + proratedInterestCents
  newOutstandingCents = outstandingCents - principalPortionCents

RATIONALE FOR THE PRORATION

If the borrower pays exactly on the scheduled date, prorationFactor
is 1.0 and they pay the full scheduled monthly amount.

If they pay early, prorationFactor < 1.0 and they pay less interest
(reflecting fewer days the principal was outstanding) but the same
principal portion as the original schedule would have allocated.

If they pay exactly N days late and we accepted it (currently we
don't — late payments are routed to legacy CRM), prorationFactor
would be > 1.0. We reject late payments as before.

UNCHANGED FROM STAGE 1

- Day counting: exclusive (differenceInCalendarDays).
- Rounding: integer cents, half-up (roundHalfUp).
- Late payment refusal: if payOnDate > addMonths(lastPaymentDate, 1),
  throw LatePaymentError.
- AllInstalmentsPaidError when instalmentsAlreadyPaid >= totalInstalments.
- Loan-start ≤ last-payment validation.

NEW ACCEPTANCE TESTS — REPLACE OLD MODE B TESTS

Replace tests 8 through 14 in src/lib/calc.test.ts with these new
tests. Stage 1 tests (1 through 7) stay exactly as they are — DO
NOT modify them. The Stage 1 Mode A engine is not affected.

TEST 8 — Original schedule, Loan A from CRM
Inputs:
  originalPrincipal = $1,000 (100000 cents)
  totalInstalments = 6
  monthlyPayment = $186.13 (18613 cents)
  monthlyRatePercent = 3.25
  loanStartDate = 2026-04-04
Expected: generateOriginalSchedule produces these rows
  Row 1: dueDate=2026-05-04, principal=15363, interest=3250, total=18613
  Row 2: dueDate=2026-06-04, principal=15862, interest=2751, total=18613
  Row 3: dueDate=2026-07-04, principal=16378, interest=2235, total=18613
  Row 4: dueDate=2026-08-04, principal=16910, interest=1703, total=18613
  Row 5: dueDate=2026-09-04, principal=17460, interest=1153, total=18613
  Row 6: dueDate=2026-10-04, principal=18027, interest=586,  total=18613
  Sum of principals = 100000 (exactly $1,000)

TEST 9 — Original schedule, Loan B from CRM
Inputs:
  originalPrincipal = $5,000 (500000 cents)
  totalInstalments = 12
  monthlyPayment = $509.84 (50984 cents)
  monthlyRatePercent = 3.25
  loanStartDate = 2026-04-21
Expected: generateOriginalSchedule produces 12 rows
  Row 1:  principal=34734, interest=16250, total=50984
  Row 2:  principal=35863, interest=15121, total=50984
  Row 3:  principal=37028, interest=13956, total=50984
  Row 4:  principal=38232, interest=12752, total=50984
  Row 5:  principal=39474, interest=11510, total=50984
  Row 6:  principal=40757, interest=10227, total=50984
  Row 7:  principal=42082, interest=8902,  total=50984
  Row 8:  principal=43450, interest=7534,  total=50984
  Row 9:  principal=44862, interest=6122,  total=50984
  Row 10: principal=46320, interest=4664,  total=50984
  Row 11: principal=47825, interest=3159,  total=50984
  Row 12: principal=49373, interest=1605,  total=50978
                                            (LAST ROW: $509.78,
                                             $0.06 less, absorbs
                                             remainder)
  Sum of principals = 500000 (exactly $5,000)

This is the canonical CRM schedule from the second screenshot.
All values match the CRM screenshot to the cent.

TEST 10 — On-time scheduled payment
Inputs (Loan A baseline):
  originalPrincipal=$1,000, totalInstalments=6, instalmentsAlreadyPaid=0,
  outstanding=$1,000, rateUnit='monthly', ratePercent=3.25,
  monthlyPayment=$186.13, loanStartDate=2026-04-04,
  lastPaymentDate=2026-04-04, payOnDate=2026-05-04
Expected:
  daysSinceLastPayment = 30
  daysInScheduledMonth = 30
  prorationFactor = 1.0
  scheduledInterest = 32.50
  proratedInterest = 32.50
  principalPortion = 18613 − 3250 = 15363
  todayAmount = 18613 cents = $186.13
  newOutstanding = 84637 cents = $846.37
  (i.e., exactly matches the CRM's first row outcome)

TEST 11 — Early payment (7 days early)
Inputs: same as TEST 10 but payOnDate=2026-04-27
Expected:
  daysSinceLastPayment = 23
  daysInScheduledMonth = 30
  prorationFactor = 23/30 ≈ 0.7667
  scheduledInterest = 3250 cents
  proratedInterest = roundHalfUp(3250 × 0.7667) = 2492 cents
  principalPortion = 15363 cents
  todayAmount = 15363 + 2492 = 17855 cents = $178.55
  newOutstanding = 100000 − 15363 = 84637 cents

TEST 12 — Same-day payment (0 days early)
Inputs: same as TEST 10 but payOnDate=2026-04-04 (same as lastPaymentDate)
Expected:
  daysSinceLastPayment = 0
  prorationFactor = 0
  proratedInterest = 0
  todayAmount = 15363 cents = $153.63 (principal only)
  newOutstanding = 84637 cents

TEST 13 — Validation: lastPaymentDate before loanStartDate throws
TEST 14 — Validation: payOnDate > addMonths(lastPayment,1) throws LatePaymentError

INSTALMENT-NUMBERING FOR REMAINING SCHEDULE

When generating the remaining schedule after today's payment:
- "Today's row" is the (instalmentsAlreadyPaid + 1)-th instalment
- The first remaining row is the (instalmentsAlreadyPaid + 2)-th
- The last remaining row is the totalInstalments-th

Their dueDates are addMonths(loanStartDate, rowNumber).

Their per-row math uses newOutstandingCents as the starting balance
and proceeds with standard amortisation.

UI CHANGES IN ModeBScheduledPayment.tsx

1. REMOVE the "Principal portion per instalment" field entirely.
   Remove auto-fill logic. Remove the "Advanced: override" toggle
   (if it was added in a recent commit, undo that change).

2. ADD a "Monthly payment amount" required field with helper text:
     "From the CRM or Note of Contract"

3. The rate-unit toggle default flips: was Per Year, now Per Month
   (the CRM's native convention is monthly).

4. Both the result panel and the receipt now show:
     - Days since last payment
     - Scheduled monthly interest (the un-prorated value)
     - Proration factor (e.g., "23/30 = 76.67%")
     - Prorated interest
     - Principal portion
     - Today's amount (large/bold)
   All other display elements (next due date, new outstanding,
   side-by-side schedule comparison) stay as they are.

5. The Original Schedule and New Remaining Schedule tables update
   to use the new amortisation formula. Both have 4 columns:
   Due / Principal / Interest / Total.

DB MIGRATION (v3 → v4)

Old Mode B records have a 'principalPortionCents' field that
no longer applies. Migration: when reading a v3 scheduled record,
set monthlyPaymentCents = (any existing value if present) ||
principalPortionCents + first-row scheduled interest, as a best-
effort backfill. The original schedule may be empty for legacy
records — leave it empty rather than back-computing.

Bump DB_VERSION to 4. Add upgrade callback that runs for
oldVersion < 4.

STEPS FOR THE BUILD

1. Update src/lib/calc.ts: rewrite generateOriginalSchedule with
   the new signature (monthlyPaymentCents instead of
   principalPortionCents). Rewrite calculateScheduledPayment with
   the new amortisation+proration math.
2. Update src/lib/types.ts: replace principalPortionCents with
   monthlyPaymentCents in ScheduledPaymentInput,
   ScheduledPaymentOutputsStored, and the form field types.
3. Update src/lib/schema.ts: rename principalPortionDollars to
   monthlyPaymentDollars. Update refinements accordingly.
4. Update src/lib/db.ts: bump DB_VERSION to 4, add the v3→v4
   migration described above.
5. Rewrite src/lib/calc.test.ts: replace tests 8-14 with the new
   tests above. Stage 1 tests (1-7) stay unchanged.
6. Run pnpm test. All 14 tests must pass before moving on.
7. Update src/components/ModeBScheduledPayment.tsx: remove
   principal portion field and its logic; add monthly payment
   field; update form defaults; update result panel rendering to
   show proration breakdown.
8. Update src/components/ScheduleComparison.tsx: the schedule
   rows now carry the same column shape; no structural changes
   except confirming both tables show 4 columns with the new
   amortisation values.
9. Update src/components/PrintReceipt.tsx: update Mode B receipt
   to show new fields (monthly payment, proration breakdown).
10. Update src/components/History.tsx detail dialog for Mode B
    records to show new fields.
11. Update README.md: replace the Mode B section with the new
    annuity model. Replace the test table with TESTs 8-14 as
    described above.
12. Run pnpm test (all 14 pass), pnpm build (clean).
13. Re-run pnpm tsx scripts/edge-cases.ts to ensure no regression
    in Mode A edge cases. If Mode B edge cases now fail, update
    the script to reflect the new model.
14. Commit with message:
    "refactor(calc): rebuild Mode B math as annuity amortisation
     to match CRM"
15. Push to GitHub so Vercel auto-deploys.

STOPPING POINT

When all 14 tests pass, the build is clean, and the dev server
serves Mode B with the new fields, stop and report:
- The commit hash
- Confirmation that all 14 tests pass
- Any spec ambiguity you noticed
- Any silent default you resolved

DO NOT TOUCH

- Stage 1 (Mode A) code, tests, or UI
- The audit log structure beyond the migration
- The mode order (Mode B already comes first per recent change)
- The print landscape A4 setting