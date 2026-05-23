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
- **Rate input:** entered as a nominal **annual** percent (Mode B is always
  annual; Mode A keeps its per-year ⇄ per-month toggle, where per-month is
  ×12, no compounding). Daily rate is `annual_rate / 100 / 365`.
- **Day counting (actual calendar days):** both modes count **actual**
  calendar days from the last actual payment to the pay-on date via
  `daysBetween` (`differenceInCalendarDays`) — a 31-day calendar month counts
  31, a 30-day month counts 30. Combined with the **`/365`** divisor this
  matches how the real loan ledgers accrue interest.
  > **Interest uses ACTUAL calendar days ÷ 365. The earlier 30/360 ÷360 method
  > (commit 0d5435d) was incorrect and has been reverted. Do not re-introduce
  > /360.** Works for any mid-schedule borrower (1/8, 6/7, …) via the current
  > outstanding — the calculator computes one payment at a time and the
  > schedule position is already reflected in the entered balance. Any earlier
  > note claiming "30/360 is intentional" is obsolete.
- **Rounding:** all intermediate math in integer cents. Final display
  rounded half-up (not banker's). Implemented as
  `Math.sign(x) * Math.floor(Math.abs(x) + 0.5)`.
- **Mode A formula (actual-days / 365):**
  ```
  days = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate = (annualRate / 100) / 365        (per-month input is ×12 first)
  interestCents = roundHalfUp(outstandingCents × dailyRate × days)
  totalCents = outstandingCents + interestCents + outstandingLateFeeCents
  ```
  Outstanding late fee is added as-is. Mode A does not compute late fees —
  the officer enters whatever's already on record.
- **Mode B model (actual-days / 365 daily interest):**
  ```
  days            = differenceInCalendarDays(payOnDate, lastPaymentDate)
  dailyRate       = (annualRatePercent / 100) / 365
  interestCents   = roundHalfUp(outstandingCents × dailyRate × days)
  principalCents  = monthlyPaymentCents − interestCents
  newOutstanding  = outstandingCents − principalCents
  todayAmount     = monthlyPaymentCents          (ALWAYS, fixed)
  ```
  The borrower always pays the fixed monthly payment; the interest/principal
  split varies with the actual day count. Paying earlier means fewer days of
  interest, so more goes to principal — no special "early" handling needed.
  Same-day payment (`days = 0`) means zero interest. Rate is entered as a
  nominal annual percent. Both modes share the same actual-days / 365 method.

## Test cases for the accountant

These are also encoded as Vitest tests in `src/lib/calc.test.ts`. Re-key
each one into the calculator UI and verify the on-screen total matches.

All amounts use **actual calendar days** with a **/365** divisor, matching the
real loan ledgers.

### Day count — actual calendar days

`daysBetween(2026-04-21, 2026-05-21) = 30` · `(2026-04-01, 2026-04-15) = 14` ·
`daysBetween(2026-05-21, 2026-06-21) = 31` (real calendar days, **not** 30) ·
pay-on before last payment → **throws**.

### Mode A — Full Settlement (actual-days / 365)

| #  | Outstanding | Rate         | Last payment | Pay-on date | Late fee | Days | Interest | **Total** |
|----|-------------|--------------|--------------|-------------|----------|------|----------|-----------|
| A1 | $2,400.00   | 48% per year | 2026-05-01   | 2026-05-21  | $0       | 20   | $63.12   | **$2,463.12** |
| A2 | $2,400.00   | 48% per year | 2026-05-01   | 2026-05-21  | $60.00   | 20   | $63.12   | **$2,523.12** |

Validation: outstanding must be > 0 and pay-on must not be before the last
payment date.

### Mode B — Scheduled Payment (actual-days / 365 daily interest)

| #  | Case | Asserts |
|----|------|---------|
| B1 | **30-day month** — outstanding $2,104.80 @ 39%/yr, monthly $234.52, last 2026-04-21, payOn 2026-05-21 | days = 30, interest = $67.47 `roundHalfUp(210480 × 0.39/365 × 30)`, principal = $167.05, **TODAY = $234.52** (= monthly payment), newOutstanding = $1,937.75. |
| B2 | **Early payment within a cycle (14 days)** — outstanding $2,000 @ 39%/yr, monthly $234.52, last 2026-04-01, payOn 2026-04-15 | days = 14, interest = $29.92 `roundHalfUp(200000 × 0.39/365 × 14)`, principal = $204.60, **TODAY = $234.52**, newOutstanding = $1,795.40. |
| B3 | **Mid-schedule borrower (6 of 7), early (17 days)** — outstanding $1,200 @ 39%/yr, monthly $234.52, last 2026-04-01, payOn 2026-04-18 | days = 17, interest = $21.80 `roundHalfUp(120000 × 0.39/365 × 17)` (2179.726 → 2180; the instruction sheet's $21.79 was the truncated value), principal = $212.72, **TODAY = $234.52**, newOutstanding = $987.28. |
| B4 | **Same-day payment** — outstanding $1,000 @ 39%/yr, monthly $186.13, last & payOn 2026-04-04 | days = 0, interest = $0.00, principal = $186.13, **TODAY = $186.13**, newOutstanding = $813.87. |
| B5 | **Real ledger first-payment stub** — outstanding $2,300 @ 39%/yr, monthly $234.52, last (= disbursement) 2025-08-21, payOn 2025-09-06 | days = 16, interest = $39.32 `roundHalfUp(230000 × 0.39/365 × 16)` (must match the CRM Loan 3 first row). |
| —  | Validation | outstanding > 0, rate > 0, monthly payment > 0, pay-on not before last → **throws**. |

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
│   ├── calc.test.ts   ← 13 acceptance tests (4 daysBetween + 3 Mode A + 6 Mode B, actual-days/365)
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
