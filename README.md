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

When the new build first loads in a browser that already has Stage 1
history, the IndexedDB schema migrates automatically from v1 to v2
(every existing record is backfilled with `mode = "fullSettlement"`).
No officer action required.

## What's in the box

- **Calculator** tab — a mode selector at the top toggles between the two
  modes:
  - **Full Settlement (Mode A):** borrower ref, outstanding principal,
    interest rate + per-month / per-year toggle, last payment date, pay-on
    date, optional outstanding late fee. Result shows days, daily rate,
    interest accrued, late fee (if any), large TOTAL TO PAY.
  - **Scheduled Payment / Early (Mode B):** borrower ref, original loan
    principal, total instalments, instalments already paid, outstanding
    principal as of last payment, rate + unit, last payment date, pay-on
    date, principal portion per instalment. The principal-portion field
    auto-fills from `original / total` and shows a `(auto: $X.XX —
    change if rounding differs)` hint; the officer can override. Result
    shows today's principal + interest + TODAY'S AMOUNT, new outstanding,
    next scheduled due date, days from today to next due date, and the
    full remaining schedule table.
- **Print Receipt**: hits the browser's native print dialog. Receipt
  uses `S$` for clarity and includes a short receipt ID, officer name,
  borrower ref, and either the settlement layout (Mode A) or the
  scheduled-payment layout with remaining-schedule table (Mode B).
- **History** tab: every calculation auto-saves to IndexedDB. Mode is
  shown as a column; rows are clickable to expand into a full detail
  dialog (including the schedule table for Mode B records). Searchable
  by borrower ref, filterable by date range.
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
- **Mode B formula (today's payment):**
  ```
  days = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate = (annualRate / 100) / 365
  interestPortion = roundHalfUp(outstandingCents × dailyRate × days)
  todayAmount = principalPortion + interestPortion
  newOutstanding = outstandingCents - principalPortion
  ```
- **Mode B lateness check:** if
  `payOnDate > addMonths(lastPaymentDate, 1)` (strict `>`), refuse and
  surface the legacy-CRM message. Paying exactly on the due date is
  on-time.
- **Mode B Policy X (remaining schedule):** the first future instalment's
  due date is `addMonths(lastPaymentDate, 2)` — i.e., the **original**
  scheduled date, **not** shifted forward by today's payment. Each
  subsequent row uses `addMonths(prev, 1)` and the calendar-day
  difference between adjacent rows. The first row's interest covers the
  actual days from `payOnDate` to that fixed due date, which is longer
  than 28-31 days whenever today's payment was early.
- **Mode B last-row rounding:** when the auto principal portion doesn't
  divide the original loan evenly, the last row's principal absorbs the
  cent-level remainder so the loan closes at exactly zero outstanding.

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

### Mode B — Scheduled Payment (Early / On-time)

Shared inputs unless stated otherwise: original loan principal $6,000,
total instalments 6, instalments already paid 2, outstanding principal
$4,000.00, rate 48% per year, last payment 2026-02-01, principal portion
$1,000.00.

| #  | Variation                                | Pay-on date | Days | Interest portion | TODAY'S AMOUNT | New outstanding | Next due date | Days to next due | Notes |
|----|------------------------------------------|-------------|------|------------------|----------------|-----------------|---------------|------------------|-------|
| 8  | On-time payment                          | 2026-03-01  | 28   | $147.29          | **$1,147.29**  | $3,000.00       | 2026-04-01    | 31 days          | Remaining schedule: Apr 1 / May 1 / Jun 1; closes to $0 |
| 9  | Same loan paid 7 days early              | 2026-02-22  | 21   | $110.47          | **$1,110.47**  | $3,000.00       | 2026-04-01    | 38 days          | **Policy X** — next due date does NOT shift. First remaining row covers 38 days, so its interest is higher than the on-time case's first remaining row. |
| 10 | Same loan paid late                      | 2026-03-15  | —    | —                | —              | —               | —             | —                | **Refused.** Use the legacy CRM for late payments. |
| 11 | Same loan but `instalmentsAlreadyPaid = 6` | 2026-03-01 | —    | —                | —              | —               | —             | —                | **Refused.** "All instalments already paid." |
| 12 | $1,000 loan, 3 instalments, none paid yet, principal portion $333.33, pay-on 2026-02-01 (one month after 2026-01-01 last payment) | 2026-02-01 | 31 | $40.77 | **$374.10** | $666.67 | 2026-03-01 | 28 days | Auto principal $333.33 (33333¢) is short 1¢ over 3 rows. **Last remaining row's principal becomes $333.34** so today + 2 remaining rows sum to exactly $1,000 of principal. |

## ⚠️ Before deploying to the team

The accountant **MUST** verify at least 5 real past settlements **AND** at
least 5 real past scheduled instalments (mix of on-time and early) against
this calculator. If any differ by more than 1 cent, **do not deploy until
investigated**. The test values above prove the engine matches the spec
this tool was built against; they do not prove the spec matches the Note
of Contract for every borrower. Independent verification is mandatory.

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
│   ├── calc.test.ts   ← 12 acceptance tests (7 Mode A + 5 Mode B)
│   ├── format.ts      ← S$ formatter, date helpers, Asia/Singapore
│   ├── db.ts          ← IndexedDB wrapper, v1→v2 mode-field migration
│   ├── schema.ts      ← zod form schemas (Mode A + Mode B)
│   ├── types.ts       ← CalculationRecord discriminated union
│   └── utils.ts       ← cn() (shadcn)
├── hooks/
│   └── useLocalStorage.ts
└── components/
    ├── Calculator.tsx              ← mode selector wrapper
    ├── ModeAFullSettlement.tsx     ← Mode A form + result panel
    ├── ModeBScheduledPayment.tsx   ← Mode B form + result panel + schedule
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
