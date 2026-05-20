SCOPE

Build the Full Settlement Calculator for the moneylender's collection team.
Greenfield repo, separate from the main CRM and marketing website.

Single-page web application. No backend, no server, no authentication
beyond an officer name field on first load. Runs in the browser on office
laptops. Calculations and audit log stored in the browser's IndexedDB so
history survives page refreshes and computer restarts.

This is Stage 1 of a two-stage tool. Stage 1 covers FULL SETTLEMENT only
(borrower pays off the entire loan today or on a chosen date). Stage 2,
which will add scheduled instalments with late fee handling, is NOT in
scope for this build.

This is a TEMPORARY tool. The math it encodes will eventually move into
the main CRM's /backend/interest/ module. Build it cleanly enough that
the core calculation functions can be lifted directly into the CRM later,
but do not over-engineer it.

DEFAULTS (change these in this prompt before sending if you disagree)

- Repo: new separate repo `moneylender-payment-calculator`
  (NOT inside the CRM monorepo, NOT inside the marketing website repo)
- Local path: C:\Users\Admin\Projects\moneylender-payment-calculator
- Stack: Vite + React + TypeScript (strict) + Tailwind v4 + shadcn/ui
  (consistent with the marketing website stack)
- Storage: IndexedDB via `idb` library (no server, no database)
- PDF/print: native browser print, styled with print CSS
- Package manager: pnpm
- Node: latest LTS
- Deployment: static site, can be hosted on Vercel free tier or opened
  as a local file. NOT pushed to GitHub yet — user creates remote manually.

LOCKED SPECIFICATION (do not change without explicit confirmation)

Loan model:
- Reducing balance, interest charged on outstanding principal only.
- Interest rate is per-loan (entered by officer each time, not configured).

Interest rate input:
- Single field labelled "Interest rate" with a toggle: ( ○ Per month / ● Per year )
- Default selection: Per year (annual).
- Annual is interpreted as nominal annual = monthly × 12 (NOT effective annual,
  NO compounding).
- Daily rate calculation:
    if input is annual:  daily_rate = (annual_rate / 100) / 365
    if input is monthly: daily_rate = (monthly_rate / 100) * 12 / 365
  Both produce the same daily rate for equivalent inputs.

Day counting:
- Exclusive on both ends. Difference in calendar days, no +1.
- Example: 1 Feb 2026 to 22 Feb 2026 = 21 days.
- Use date-fns `differenceInCalendarDays` (returns exclusive count by default).
- Do NOT "correct" this to inclusive — this matches the Note of Contract.

Rounding:
- All intermediate calculations in cents as integers. No floats for money.
- Final display rounded to nearest cent, half-up.
- Use a deterministic half-up rounder, not JavaScript's default banker's
  rounding. Helper function `roundHalfUp(value: number): number` in calc.ts.

Mode A — Full Settlement:
  days = differenceInCalendarDays(payOnDate, lastPaymentDate)
  daily_rate = (annual_rate / 100) / 365     [or monthly × 12 ÷ 365]
  interest_cents = roundHalfUp(outstanding_cents × daily_rate × days)
  total_cents = outstanding_cents + interest_cents + outstanding_late_fee_cents

  After this payment, loan is fully closed. No remaining schedule.

Outstanding late fee:
- Optional input field. If left blank or zero, ignored.
- Added directly to the total as a separate line item.
- Stage 1 does NOT calculate late fees — officer enters whatever has already
  been recorded as owing from prior missed payments.

GOAL

A single-page calculator that:
1. Officer logs name once (stored in localStorage), used as audit log signature.
2. Officer fills loan details and dates, clicks Calculate.
3. Result panel shows the working: days counted, daily rate, interest
   accrued, outstanding late fee (if any), total — not just the final number.
4. Officer clicks Print to generate a clean printer-friendly receipt.
5. Every calculation is auto-saved to IndexedDB with timestamp + officer name
   + all inputs + all outputs.
6. A "History" tab shows past calculations, searchable by date or borrower
   reference, so a returning borrower can be matched to a previous quote.

STEPS

1. Verify prerequisites
   - Confirm Node ≥ 22.x and pnpm installed. If either is missing, STOP
     and report — do not auto-install.

2. Scaffold the Vite + React + TS project
   - `pnpm create vite@latest moneylender-payment-calculator -- --template react-ts`
   - Navigate into the new directory.
   - Install dependencies: react-hook-form, zod, date-fns, idb, lucide-react.
   - Install and configure Tailwind v4 with `@tailwindcss/vite` per current docs.
   - Initialise shadcn/ui with `pnpm dlx shadcn@latest init`.
   - Add the shadcn components needed: button, input, label, tabs, table,
     dialog, switch (or toggle-group), card, separator.

3. Build the calculation engine FIRST, as pure functions, with tests
   - File: `src/lib/calc.ts`
   - All money in cents (integers). Helpers:
     * `dollarsToCents(amount: number): number`
     * `centsToDisplay(cents: number): string`   // returns "$1,234.56"
     * `roundHalfUp(value: number): number`      // deterministic half-up
   - Core functions:
     * `daysBetween(start: Date, end: Date): number`
       — wraps date-fns differenceInCalendarDays; throws if end < start
     * `annualToDaily(annualRatePercent: number): number`
     * `monthlyToDaily(monthlyRatePercent: number): number`
     * `calculateFullSettlement(input: FullSettlementInput): FullSettlementResult`

   - Types:
     export type RateUnit = 'annual' | 'monthly';

     export interface FullSettlementInput {
       outstandingCents: number;
       rateUnit: RateUnit;
       ratePercent: number;
       lastPaymentDate: Date;
       payOnDate: Date;
       outstandingLateFeeCents?: number;
     }

     export interface FullSettlementResult {
       days: number;
       dailyRate: number;          // decimal, not percent
       interestCents: number;
       outstandingLateFeeCents: number;
       totalCents: number;
     }

4. Vitest tests in `src/lib/calc.test.ts`
   These are acceptance tests. They MUST pass before moving on. Do NOT
   adjust expected values to make tests pass — the test values ARE the spec.

   TEST 1 — Reference case (annual rate input)
     Inputs:
       outstanding = $2,400.00 (240000 cents)
       rate = 48% per year
       lastPayment = 2026-05-01
       payOn = 2026-05-22
       outstandingLateFee = $0
     Expected:
       days = 21
       dailyRate = 0.48 / 365 = 0.001315068493150685
       interest = roundHalfUp(240000 × 0.001315068493... × 21)
                = roundHalfUp(6627.945...) = 6628 cents
       total = 240000 + 6628 + 0 = 246628 cents = "$2,466.28"

   TEST 2 — Same case, monthly rate input
     Inputs:
       outstanding = $2,400.00
       rate = 4% per month
       lastPayment = 2026-05-01
       payOn = 2026-05-22
       outstandingLateFee = $0
     Expected:
       Identical to TEST 1. Daily rate must match exactly.
       If results differ from TEST 1, the rate conversion is wrong.

   TEST 3 — Same day settlement (zero interest)
     Inputs:
       outstanding = $1,000.00
       rate = 48% per year
       lastPayment = 2026-05-15
       payOn = 2026-05-15
       outstandingLateFee = $0
     Expected:
       days = 0
       interest = 0 cents
       total = 100000 cents = "$1,000.00"

   TEST 4 — With outstanding late fee
     Inputs:
       outstanding = $2,400.00
       rate = 48% per year
       lastPayment = 2026-05-01
       payOn = 2026-05-22
       outstandingLateFee = $60.00 (6000 cents)
     Expected:
       days = 21
       interest = 6628 cents (same as TEST 1)
       total = 240000 + 6628 + 6000 = 252628 cents = "$2,526.28"

   TEST 5 — Rounding half-up boundary
     Construct inputs where unrounded interest in cents ends in exactly .5
     (e.g. 1234.5). Assert roundHalfUp returns 1235, not 1234. This guards
     against JavaScript's banker's rounding via Math.round / toFixed.

   TEST 6 — Forward quote (future date)
     Inputs:
       outstanding = $2,400.00
       rate = 48% per year
       lastPayment = 2026-05-01
       payOn = 2026-06-15
       outstandingLateFee = $0
     Expected:
       days = 45
       interest = roundHalfUp(240000 × (0.48/365) × 45)
       Compute and assert.

   TEST 7 — Validation: payOn before lastPayment must throw
     Expected: function throws a clear, descriptive error.

   Run `pnpm test`. ALL tests must pass before moving on.
   If a test fails, STOP and report the exact discrepancy.

5. Build the UI
   - Single page, three tabs: Calculator / History / Settings.

   Calculator tab:
   - Officer name shown top-right (read from localStorage).
   - Form fields:
     * Borrower reference (optional, free text, max 50 chars)
     * Outstanding principal ($ input, two decimal places)
     * Interest rate (number input) with toggle: Per month / Per year
       (default: Per year)
     * Last payment date (date picker)
     * Pay-on date (date picker, defaults to today)
     * Outstanding late fee (optional $ input, defaults to $0)
   - Validation via zod + react-hook-form:
     * Outstanding > 0
     * Rate > 0 and < 1000
     * payOn >= lastPayment
     * Late fee >= 0
   - Large "Calculate" button.
   - Result panel below the form, hidden until first calculation:
     * Days: 21
     * Daily rate: 0.131507%
     * Interest accrued: $66.28
     * Outstanding late fee: $0.00  (only shown if > 0)
     * ───────
     * TOTAL TO PAY: $2,466.28  (large, bold)
   - Action buttons under the result:
     * "Print Receipt"
     * "New Calculation" (clears form)

   History tab:
   - Table of past calculations: Date+time, Borrower ref, Outstanding,
     Days, Total
   - Click a row to expand and see full inputs + outputs + officer name.
   - Search box filtering by borrower ref.
   - Date range filter.

   Settings tab:
   - Officer name (editable, saved to localStorage).
   - Company name (editable, used on the receipt header).
   - Export history as JSON (download a file).
   - Clear history (TWO-STEP confirmation: first click shows a warning
     and a second "Yes, delete everything" button; second click clears).

6. Print receipt
   - Hidden div in DOM with `@media print` CSS that becomes the entire
     page when printing.
   - Structure:
       [Company name from Settings]
       SETTLEMENT QUOTATION
       Date: 2026-05-22 14:32
       Officer: [name from localStorage]
       Borrower ref: [from form]
       Receipt ID: [uuid short form]
       ─────────────────────────────
       Outstanding principal:        $2,400.00
       Last payment date:            01 May 2026
       Settlement date:              22 May 2026
       Days elapsed:                 21
       Interest rate:                48.00% per year
                                     (0.131507% per day)
       Interest accrued:             $66.28
       Outstanding late fee:         $0.00         [hide line if 0]
       ─────────────────────────────
       TOTAL TO PAY:                 $2,466.28
       ─────────────────────────────
       Signature: ______________________
   - Test by hitting Ctrl+P — the receipt is the entire page, no
     calculator UI bleeding through.

7. Auto-save on every Calculate click
   - Write to IndexedDB store `calculations` with:
       { id, timestamp, officerName, borrowerRef, inputs, outputs }
   - This is the audit log. Never edited or deleted from the UI except
     via Settings → Clear History (two-step confirm).

8. Manual smoke test in the browser before declaring done:
   - Enter TEST 1 inputs; verify screen shows "$2,466.28".
   - Print preview — receipt looks clean.
   - Refresh page — history persists.
   - Open Settings; change officer name; verify it updates.

9. README.md with:
   - One paragraph: what this tool is, who it's for.
   - "How to run": `pnpm install && pnpm dev`
   - "How to verify": run `pnpm test`, all tests should pass.
   - "How to deploy": `pnpm build` produces a static `dist/` folder.
   - "Test cases for the accountant" — list the 7 tests with inputs and
     expected outputs so the accountant can independently verify.
   - Warning section: "Before deploying to the team — the accountant
     MUST verify at least 5 real past settlements against this calculator.
     If any differ by more than 1 cent, do not deploy until investigated."

CONSTRAINTS

- Pure functions for all math. No side effects in `calc.ts`.
- Money in cents (integers) everywhere. Convert to dollars only at the
  display boundary.
- Dates handled with date-fns, not raw Date math.
- All times stored as UTC ISO strings; displayed in Asia/Singapore.
- No `any` types. If something genuinely needs a flexible type, comment why.
- All components in `src/components/`. All logic in `src/lib/`.
  UI components consume `lib/` functions, never compute money themselves.
- TypeScript strict mode. Zero errors, zero warnings.
- Page must work on a basic Chrome/Edge install with no extensions,
  on a 1366×768 office laptop screen.

DO NOT

- Do not add user accounts, login, or any server-side anything.
- Do not add MLCB lookup or aggregate cap logic — out of scope.
- Do not add WhatsApp / SMS sending — separate project.
- Do not connect to the legacy CRM API — separate project.
- Do not add multi-currency support — SGD only, hard-coded.
- Do not add charts or graphs — text and tables only.
- Do not commit or push to a git remote. Local repo only.
- Do not build Mode B (scheduled instalments) — Stage 2 only.

STOPPING POINT

When all 7 tests pass and you can manually verify TEST 1 in the browser,
stop and report:
- Where the repo is.
- How to run it locally (`pnpm dev` and the URL).
- The 7 test cases for the accountant to verify.
- Any spec ambiguity you hit that you resolved with a default — list each
  one so we can confirm.

Produce a plan first. Do not write code until the plan is confirmed.