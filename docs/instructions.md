Generate an edge-case scenario report for the calculator.

Goal: surface scenarios that the existing 14 acceptance tests do
not cover, where the calculator might silently produce wrong or
unexpected results. Do NOT modify calc.ts. Do NOT add to the
test suite. This is a one-off diagnostic report, not a feature.

Create a new file: docs/edge-case-report.md

For each scenario below, compute the result by directly calling
calculateFullSettlement or calculateScheduledPayment from a small
TypeScript script (place it in scripts/edge-cases.ts and run it
once with `pnpm tsx scripts/edge-cases.ts` — install tsx if needed
as a dev dep). Capture all inputs and the full result. Render
into the markdown file as a series of sections, one per scenario,
with:
  - Scenario description
  - Inputs
  - Expected behaviour (what a sensible result would look like —
    your honest read, not a hard assertion)
  - Actual output (key fields)
  - Flag any result that looks suspicious, surprising, or wrong

Scenarios to run:

A. END-OF-MONTH BEHAVIOUR
   A1. Mode B: loan start 2026-01-31, last payment 2026-01-31,
       pay-on 2026-02-28 (a "one month later" payment where Feb has
       no 31st). Verify the next due date in the output. Note any
       day-drift in the schedule.
   A2. Mode B: loan start 2026-01-31, 6 instalments. Generate the
       original schedule. Note where each due date lands — confirm
       date-fns clamping behaviour and whether the schedule drifts
       forward after Feb.

B. LEAP YEAR
   B1. Mode A: outstanding $1,000, last payment 2028-02-15, pay-on
       2028-03-15 (crosses leap day). Verify days = 29.
   B2. Mode B: loan start 2028-01-01, 6 instalments. Check whether
       the Feb-Mar period in the original schedule has 29 days.

C. EXTREME LOAN SIZES
   C1. Mode A: outstanding $0.01 (1 cent), rate 48% per year, 100
       days. Confirm interest rounds sensibly, total >= principal.
   C2. Mode A: outstanding $1,000,000 (1 million), rate 48% per
       year, 30 days. Confirm no floating-point precision issues
       (interest should be a clean integer cents value).
   C3. Mode B: original principal $100,000, 24 instalments. Confirm
       original schedule generates without error.

D. EXTREME INSTALMENT COUNTS
   D1. Mode B: 1 total instalment, 0 already paid. Does the form
       accept this? What does the schedule look like? Single row
       only, paid on the spot.
   D2. Mode B: 24 instalments. Schedule should have 24 rows; last
       row outstandingAfter = 0.

E. ROUNDING EDGE CASES
   E1. Mode B: $1,000 / 7 instalments. Principal portion = $142.857...
       which rounds to $142.86. 7 × 142.86 = $1,000.02 — over by
       2 cents. Verify the last row absorbs the -2 cent remainder
       so the loan still closes at exactly $0.
   E2. Mode B: $999.99 / 3 instalments. Awkward division. Confirm
       sums.

F. ZERO-OR-NEAR-ZERO EDGE CASES
   F1. Mode A: outstanding $1,000, last payment = pay-on (same day).
       Days = 0, interest = 0, total = $1,000.
   F2. Mode B: outstanding equals principal portion (i.e. this is
       the last instalment). After today, outstanding = 0. Should
       remainingSchedule be empty? Confirm.

G. RATE BOUNDARIES
   G1. Mode A: rate = 0.01% per year. Very low rate. Confirm
       interest computes without underflow.
   G2. Mode A: rate = 999% per year (just under the validation
       ceiling of 1000). Confirm large interest computes without
       overflow.

H. EARLY-PAYMENT EXTREMES IN MODE B
   H1. Loan start 2026-01-01, last payment 2026-01-01, pay-on
       2026-01-02 (1 day after loan start, 30 days early). Days = 1.
       Interest tiny. Officer pays "first instalment" essentially
       on the spot. Sensible?
   H2. Loan start 2026-01-01, last payment 2026-01-01, pay-on
       2026-01-31 (one day before the natural due date of 2026-02-01).
       Days = 30, just under a month. Should be accepted.

For each scenario, after computing the result, write a one-line
verdict in the report: "OK — behaves as expected" or "FLAG —
[describe the surprise]".

End the report with a "Summary" section listing only the FLAG
entries, so I can scan it in 30 seconds.

Do NOT change any production code based on what you find. Just
report. We decide what to fix after reading the report.