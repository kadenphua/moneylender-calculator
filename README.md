# Moneylender Payment Calculator

A single-page browser tool used by the collection team for two kinds of
payoff calculation:

- **Mode A — Full Settlement.** Borrower pays off the entire reducing-balance
  loan today or on a chosen future date. Includes any outstanding late fee.
- **Mode B — Scheduled Payment.** Borrower pays their fixed monthly payment.
  The calculator splits that payment into interest (accrued daily on the
  current outstanding, from the last payment date to the pay-on date) and
  principal, then returns today's amount (always the monthly payment) and the
  new outstanding.

Mode B uses a simple daily-interest model — the borrower always pays the fixed
monthly amount; paying earlier just means less interest has accrued, so more of
the payment goes to principal.

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
  `scheduledInterestCents` defaults.
- v4 → v5: Mode B rebuilt as a daily-interest model. Legacy scheduled
  records gain an `annualRatePercent` input (the old `ratePercent`, ×12
  if it was per-month) and `interestCents` / `principalCents` outputs
  (best-effort, from the old prorated `interestPortionCents` /
  `principalPortionCents`). Legacy fields are left in place; the new UI
  reads only the new ones.
No officer action required.

## What's in the box

- **Calculator** tab — a mode selector at the top toggles between the two
  modes:
  - **Full Settlement (Mode A):** borrower ref, outstanding principal,
    interest rate + per-month / per-year toggle, last payment date, pay-on
    date, optional outstanding late fee. Result shows days, daily rate,
    interest accrued, late fee (if any), large TOTAL TO PAY.
  - **Scheduled Payment (Mode B):** borrower ref, current outstanding,
    annual interest rate (always entered as an annual %, with a live
    per-month equivalent beside the field), monthly payment amount (from
    the CRM or Note of Contract), last payment date, and pay-on date.
    Result shows days since last payment, the interest rate (with its
    per-month equivalent), the interest charged on this payment, the
    principal portion, the large TODAY'S AMOUNT (always the monthly
    payment), and the new outstanding.
- **Print Receipt**: hits the browser's native print dialog. Both modes
  use `S$` for clarity and include a short receipt ID, officer name and
  borrower ref. Mode A prints the settlement layout; Mode B prints the
  scheduled-payment layout (current outstanding, rate, monthly payment,
  dates, days, interest / principal split, today's amount, new
  outstanding).
- **History** tab: every calculation auto-saves to IndexedDB. Mode is
  shown as a column; rows are clickable to expand into a full detail
  dialog. Searchable by borrower ref, filterable by date range.
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
- **Mode B model (daily interest):**
  ```
  days            = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate       = (annualRatePercent / 100) / 365
  interestCents   = roundHalfUp(outstandingCents × dailyRate × days)
  principalCents  = monthlyPaymentCents − interestCents
  newOutstanding  = outstandingCents − principalCents
  todayAmount     = monthlyPaymentCents          (ALWAYS, fixed)
  ```
  The borrower always pays the fixed monthly payment; the split between
  interest and principal varies with the number of days since the last
  payment. Same-day payment (`days = 0`) means zero interest, so the whole
  monthly payment goes to principal. The rate is always entered as a nominal
  annual percentage (the per-year ⇄ per-month toggle was removed); interest
  uses the same daily method as Mode A.

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

### Mode B — Scheduled Payment (daily-interest model)

The verified reference case (B1) matches the CRM cent-for-cent: outstanding
$2,174.45 @ 41% annual, monthly payment $598.68, last payment 2026-04-27.

| #  | Case | Asserts |
|----|------|---------|
| B1 | **Verified reference** — outstanding $2,174.45 @ 41%/yr, monthly $598.68, last 2026-04-27, payOn 2026-05-22 | days = 25, interest = $61.06 `roundHalfUp(217445 × 0.41/365 × 25)`, principal = $537.62, **TODAY = $598.68** (= monthly payment), newOutstanding = $1,636.83. |
| B2 | **Same-day payment** — outstanding $1,000 @ 39%/yr, monthly $186.13, last & payOn 2026-04-04 | days = 0, interest = $0.00, principal = $186.13, **TODAY = $186.13**, newOutstanding = $813.87. |
| B3 | **30-day period** — outstanding $1,000 @ 39%/yr, monthly $186.13, last 2026-04-04, payOn 2026-05-04 | days = 30, interest = $32.05 `roundHalfUp(100000 × 0.39/365 × 30)`, principal = $154.08, **TODAY = $186.13**, newOutstanding = $845.92. |
| B4 | Validation: pay-on **before** last payment | **Refused** (day count is negative). |
| B5 | Validation: outstanding > 0, 0 < rate < 1000, monthly payment > 0 | Each violated bound **throws**. |

## ⚠️ Before deploying to the team

The accountant **MUST** verify at least 5 real past settlements **AND** at
least 5 real past scheduled instalments against this calculator. If any
differ by more than 1 cent, **do not deploy until investigated**. The test
values above prove the engine matches the spec this tool was built against;
they do not prove the spec matches the Note of Contract for every borrower.
Independent verification is mandatory.

## Stack & layout

- Vite 8 + React 19 + TypeScript 6 (strict, `verbatimModuleSyntax`)
- Tailwind v4 via `@tailwindcss/vite` + shadcn/ui (new-york, neutral)
- react-hook-form + zod for form validation
- date-fns for calendar-day math (`differenceInCalendarDays`)
- idb for IndexedDB
- uuid for receipt IDs
- vitest + jsdom + @testing-library/jest-dom

```
src/
├── lib/
│   ├── calc.ts        ← pure engine (no React, lift-ready for CRM)
│   ├── calc.test.ts   ← 12 acceptance tests (7 Mode A + 5 Mode B daily-interest)
│   ├── format.ts      ← S$ formatter, date helpers, Asia/Singapore
│   ├── db.ts          ← IndexedDB wrapper, v1→v2 mode … v4→v5 daily-interest Mode B
│   ├── schema.ts      ← zod form schemas (Mode A + Mode B)
│   ├── types.ts       ← CalculationRecord discriminated union
│   └── utils.ts       ← cn() (shadcn)
├── hooks/
│   └── useLocalStorage.ts
└── components/
    ├── Calculator.tsx              ← mode selector wrapper
    ├── ModeAFullSettlement.tsx     ← Mode A form + result panel
    ├── ModeBScheduledPayment.tsx   ← Mode B form + result panel
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
- No instalment-schedule reconstruction. Mode B computes a single payment's
  interest/principal split by daily interest, not a full amortisation table.
