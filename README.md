# Moneylender Payment Calculator

A single-page browser tool used by the collection team for two kinds of
payoff calculation:

- **Mode A — Full Settlement.** Borrower pays off the entire reducing-balance
  loan today or on a chosen future date. Includes any outstanding late fee.
- **Mode B — Scheduled Payment (Early / On-time).** Borrower pays a single
  scheduled instalment on or before its due date. The calculator returns
  today's amount, the new outstanding, and the recomputed remaining schedule.

**Late payments are out of scope on purpose.** If `payOnDate >
lastPaymentDate + 1 month`, Mode B refuses the calculation and tells the
officer to use the legacy CRM. The legacy CRM continues to handle every
late-payment case for as long as this tool is in use.

The math encoded here is intended to be lifted into the main CRM's
`/backend/interest/` module later. Keep that in mind before touching
`src/lib/calc.ts`.

## How to run

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

First load asks for an officer name (stored in this browser's localStorage,
recorded on every audit-log entry). All calculations save automatically to
this browser's IndexedDB and survive page refresh / restart.

## How to verify

```sh
pnpm test         # runs the 12 acceptance tests via Vitest
```

All twelve must pass. They encode the locked specification — if any fails,
**do not adjust the expected values**. The test values are the spec; the
code follows them.

## How to deploy

```sh
pnpm build        # produces a static `dist/` folder
```

The `dist/` folder is self-contained and can be hosted on Vercel free tier,
served from any static host, or opened as a local file (some browsers
restrict IndexedDB on `file://`; if you need true offline-file usage,
prefer a tiny local server).

When the new build first loads in a browser that already has older
history, the IndexedDB schema migrates automatically:
- v1 → v2: legacy records are backfilled with `mode = "fullSettlement"`.
- v2 → v3: legacy scheduled records gain a `loanStartDate` (defaulted to
  `lastPaymentDate`) and an empty `originalSchedule`.
- v3 → v4: legacy scheduled records gain a `monthlyPaymentCents` input
  (best-effort backfill: `principalPortionCents` + first-row scheduled
  interest) plus `daysInScheduledMonth`, `prorationFactor`, and
  `scheduledInterestCents` defaults. `principalPortionCents` is no
  longer an input — Mode B now derives it per row from the amortisation
  formula.
No officer action required.

## What's in the box

- **Calculator** tab — a mode selector at the top toggles between the two
  modes:
  - **Full Settlement (Mode A):** borrower ref, outstanding principal,
    interest rate + per-month / per-year toggle, last payment date, pay-on
    date, optional outstanding late fee. Result shows days, daily rate,
    interest accrued, late fee (if any), large TOTAL TO PAY.
  - **Scheduled Payment / Early (Mode B):** borrower ref, original loan
    principal, **loan start date (required)**, total instalments,
    instalments already paid, outstanding principal as of last payment,
    rate + unit (defaults to **per month** — the CRM convention),
    **last payment date (or the loan start date if no payments have
    been made yet)**, pay-on date, **monthly payment amount** (from the
    CRM or Note of Contract — required). For a brand-new loan with
    `instalmentsAlreadyPaid = 0`, put the disbursement / loan start
    date in the "last payment date" field as well — mathematically
    that's the correct anchor for interest to accrue from. Result shows
    the days-since-last-payment vs days-in-scheduled-month breakdown,
    the scheduled monthly interest (un-prorated), the proration factor,
    the prorated interest, the principal portion, the large TODAY'S
    AMOUNT, the new outstanding, the next scheduled due date, the days
    from today to that next due date, and two schedule tables rendered
    side-by-side: the **Original Schedule** from the loan agreement
    (with `✓` markers on paid rows and `← paying today` on the
    instalment being paid this session) next to the **New Remaining
    Schedule** recalculated from the new outstanding balance. When the
    actual schedule costs less than the original future rows, a "Total
    saving across remaining schedule: S$X.XX" summary line is shown
    beneath the tables; otherwise it's hidden.
- **Print Receipt**: hits the browser's native print dialog. Mode B
  receipts print in **A4 landscape** so the Original / New comparison
  fits side-by-side; Mode A receipts share the same page size. Both
  use `S$` for clarity and include a short receipt ID, officer name,
  borrower ref, and either the settlement layout (Mode A) or the
  scheduled-payment layout with the side-by-side schedule comparison
  and a "Schedule recalculated based on actual payment date." footer
  note (Mode B).
- **History** tab: every calculation auto-saves to IndexedDB. Mode is
  shown as a column; rows are clickable to expand into a full detail
  dialog (including both schedules side-by-side for Mode B records).
  Searchable by borrower ref, filterable by date range.
- **Settings** tab: edit officer name, edit company name (printed on
  receipt header), export full history as JSON, or clear history (two-step
  confirmation).

## Spec essentials (the locked specification)

- **Loan model:** reducing balance; interest on outstanding principal only.
- **Rate input:** entered per loan. "Per year" is _nominal annual_
  (monthly × 12, no compounding). Daily rate is `annual_rate / 100 / 365`.
- **Day counting:** exclusive on both ends via date-fns
  `differenceInCalendarDays` (e.g. 1 Feb → 22 Feb = 21 days). Do **not**
  add 1.
- **Rounding:** all intermediate math in integer cents. Final display
  rounded half-up (not banker's). Implemented as
  `Math.sign(x) * Math.floor(Math.abs(x) + 0.5)`.
- **Mode A formula:**
  ```
  days = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate = (annualRate / 100) / 365
  interestCents = roundHalfUp(outstandingCents × dailyRate × days)
  totalCents = outstandingCents + interestCents + outstandingLateFeeCents
  ```
  Outstanding late fee is added as-is. Mode A does not compute late fees —
  the officer enters whatever's already on record.
- **Mode B model:** standard amortisation against a fixed monthly
  payment (annuity-style — matches the CRM). Per-row formula:
  ```
  monthlyRate = (rateUnit === "annual") ? ratePercent / 12 : ratePercent
  interestCents       = roundHalfUp(outstandingCents × monthlyRate / 100)
  principalCents      = monthlyPaymentCents − interestCents
  totalCents          = monthlyPaymentCents  (constant for every row except the last)
  outstandingAfterRow = outstandingCents − principalCents
  ```
  The last row's principal absorbs whatever balance remains so the loan
  closes at exactly zero (its total may differ from
  `monthlyPaymentCents` by a few cents).
- **Mode B today's payment (the early/on-time math):**
  ```
  daysSinceLastPayment = differenceInCalendarDays(payOnDate, lastPaymentDate)
  daysInScheduledMonth = differenceInCalendarDays(
                            addMonths(lastPaymentDate, 1),
                            lastPaymentDate)
  prorationFactor      = daysSinceLastPayment / daysInScheduledMonth
  scheduledInterest    = roundHalfUp(outstandingCents × monthlyRate / 100)
  proratedInterest     = roundHalfUp(scheduledInterest × prorationFactor)
  principalPortion     = monthlyPaymentCents − scheduledInterest
                         (the principal the borrower would have paid on time)
  todayAmount          = principalPortion + proratedInterest
  newOutstanding       = outstandingCents − principalPortion
  ```
  On-time means `prorationFactor = 1.0`. Same-day payment means
  `prorationFactor = 0` (today's interest is zero, but principal is
  still allocated in full).
- **Mode B lateness check:** if
  `payOnDate > addMonths(lastPaymentDate, 1)` (strict `>`), refuse and
  surface the legacy-CRM message. Paying exactly on the scheduled date
  is on-time.
- **Mode B remaining-schedule rows** are numbered
  `(instalmentsAlreadyPaid + 2) .. totalInstalments`, each anchored
  via `addMonths(loanStartDate, rowNumber)`. The amortisation formula
  is the same as the original schedule — only the starting balance
  differs (it's the new outstanding after today's payment, not the
  original principal).

## Test cases for the accountant

These are also encoded as Vitest tests in `src/lib/calc.test.ts`. Re-key
each one into the calculator UI and verify the on-screen total matches.

### Mode A — Full Settlement

| # | Outstanding | Rate            | Last payment | Pay-on date | Late fee | Days | Interest | **Total** |
|---|-------------|-----------------|--------------|-------------|----------|------|----------|-----------|
| 1 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-05-22  | $0       | 21   | $66.28   | **$2,466.28** |
| 2 | $2,400.00   | 4% per month    | 2026-05-01   | 2026-05-22  | $0       | 21   | $66.28   | **$2,466.28** (identical to #1) |
| 3 | $1,000.00   | 48% per year    | 2026-05-15   | 2026-05-15  | $0       | 0    | $0.00    | **$1,000.00** |
| 4 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-05-22  | $60.00   | 21   | $66.28   | **$2,526.28** |
| 5 | $100.00     | 1.825% per year | 2026-01-01   | 2026-01-02  | $0       | 1    | $0.01    | **$100.01** (half-up boundary — exact 0.5¢ rounds up) |
| 6 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-06-15  | $0       | 45   | $142.03  | **$2,542.03** |
| 7 | $2,400.00   | 48% per year    | 2026-05-22   | 2026-05-01  | —        | —    | —        | **Error** — pay-on before last payment is rejected |

### Mode B — Scheduled Payment (Early / On-time, annuity model)

These match the CRM screenshots cent-for-cent. **Loan A** = $1,000 over
6 instalments at 3.25% per month, monthly payment $186.13, loan start
2026-04-04 (used by tests 8 and 10–14). **Loan B** = $5,000 over 12
instalments at 3.25% per month, monthly payment $509.84, loan start
2026-04-21 (test 9).

| #  | Case | Asserts |
|----|------|---------|
| 8  | **Loan A original schedule** — `generateOriginalSchedule($1,000, 6, $186.13, 3.25%/mo, 2026-04-04)` | 6 rows. Row 1 P=$153.63 I=$32.50 T=$186.13 · Row 2 P=$158.62 I=$27.51 · Row 3 P=$163.78 I=$22.35 · Row 4 P=$169.10 I=$17.03 · Row 5 P=$174.60 I=$11.53 · Row 6 P=$180.27 I=$5.86 T=$186.13. Sum of principals = exactly $1,000.00. |
| 9  | **Loan B original schedule** — `generateOriginalSchedule($5,000, 12, $509.84, 3.25%/mo, 2026-04-21)` | 12 rows. Rows 1-11 each total $509.84. **Last row totals $509.78 (six cents less) because it absorbs the cumulative cent-rounding remainder.** Sum of principals = exactly $5,000.00. |
| 10 | **Loan A, on-time** — first instalment, payOn 2026-05-04 (= loan-start + 1 month) | days = 30, daysInScheduledMonth = 30, prorationFactor = 1.0, scheduledInterest = $32.50, **proratedInterest = $32.50**, principalPortion = $153.63, **TODAY = $186.13**, newOutstanding = $846.37. Matches CRM row 1 exactly. |
| 11 | **Loan A, 7 days early** — same inputs but payOn 2026-04-27 | days = 23, prorationFactor ≈ 76.67% (23/30), scheduledInterest = $32.50, **proratedInterest = $24.92**, principalPortion = $153.63 (unchanged), **TODAY = $178.55**, newOutstanding = $846.37 (also unchanged — principal allocation does not depend on timing under this model). |
| 12 | **Loan A, same-day payment** — payOn 2026-04-04 (same as lastPayment) | days = 0, prorationFactor = 0, **proratedInterest = $0.00**, principalPortion = $153.63, **TODAY = $153.63**, newOutstanding = $846.37. |
| 13 | Validation: loan start date **after** last payment date | **Refused** with "Last payment date cannot be before loan start date." |
| 14 | Validation: payOn > `addMonths(lastPayment, 1)` | **Refused** with `LatePaymentError` (use the legacy CRM message). |

## ⚠️ Before deploying to the team

The accountant **MUST** verify at least 5 real past settlements **AND** at
least 5 real past scheduled instalments (mix of on-time and early) against
this calculator. If any differ by more than 1 cent, **do not deploy until
investigated**. The test values above prove the engine matches the spec
this tool was built against; they do not prove the spec matches the Note
of Contract for every borrower. Independent verification is mandatory.

**Also verify that the calculator's Original Schedule for one real
borrower matches the schedule on their Note of Contract to the cent.**
If they differ, the Note of Contract is generated with a different
convention and the schedule generator needs investigation before
deploying.

Reminder: **late payments must continue to be routed through the legacy
CRM.** This calculator deliberately refuses them in Mode B.

## Stack & layout

- Vite 8 + React 19 + TypeScript 6 (strict, `verbatimModuleSyntax`)
- Tailwind v4 via `@tailwindcss/vite` + shadcn/ui (new-york, neutral)
- react-hook-form + zod for form validation
- date-fns for calendar-day math (`differenceInCalendarDays`, `addMonths`)
- idb for IndexedDB
- uuid for receipt IDs
- vitest + jsdom + @testing-library/jest-dom

```
src/
├── lib/
│   ├── calc.ts        ← pure engine (no React, lift-ready for CRM)
│   ├── calc.test.ts   ← 14 acceptance tests (7 Mode A + 7 Mode B annuity)
│   ├── format.ts      ← S$ formatter, date helpers, Asia/Singapore
│   ├── db.ts          ← IndexedDB wrapper, v1→v2 mode, v2→v3 loanStartDate, v3→v4 monthlyPayment
│   ├── schema.ts      ← zod form schemas (Mode A + Mode B)
│   ├── types.ts       ← CalculationRecord discriminated union
│   └── utils.ts       ← cn() (shadcn)
├── hooks/
│   └── useLocalStorage.ts
└── components/
    ├── Calculator.tsx              ← mode selector wrapper
    ├── ModeAFullSettlement.tsx     ← Mode A form + result panel
    ├── ModeBScheduledPayment.tsx   ← Mode B form + result panel
    ├── ScheduleComparison.tsx      ← side-by-side Original/New tables + savings
    ├── History.tsx                 ← mode column + per-mode detail dialog
    ├── Settings.tsx
    ├── OfficerNameModal.tsx
    ├── PrintReceipt.tsx            ← per-mode receipt layout
    └── ui/                         ← shadcn primitives
```

## What this tool does NOT do

- No login, no server, no API. Officer name is a local label, not auth.
- No MLCB lookup, no aggregate cap logic.
- No WhatsApp / SMS sending.
- No legacy CRM integration.
- No multi-currency support (SGD only).
- **No late-payment handling — that's still the legacy CRM's job.** 
