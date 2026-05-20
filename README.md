# Moneylender Payment Calculator

A single-page browser tool that calculates the **full settlement** payoff
amount for a borrower paying off a reducing-balance loan today or on a chosen
future date. Built for the collection team. Stage 1 of a two-stage tool —
Stage 2 (scheduled instalments with late-fee handling) is out of scope.

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
pnpm test         # runs the 7 acceptance tests via Vitest
```

All seven must pass. They encode the locked specification — if any fails,
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

## What's in the box

- **Calculator** tab: enter borrower ref (optional), outstanding
  principal, interest rate + per-month / per-year toggle, last payment
  date, pay-on date, and optional outstanding late fee. Click Calculate.
  The result panel shows days elapsed, daily rate, interest accrued, late
  fee (if any), and a large TOTAL TO PAY.
- **Print Receipt**: hits the browser's native print dialog. Receipt
  uses `S$` for clarity and includes a short receipt ID, officer name,
  borrower ref, all inputs, and totals.
- **History** tab: every calculation auto-saves to IndexedDB. Searchable
  by borrower ref, filterable by date range. Click a row for full detail.
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
- **Outstanding late fee** is added as-is. Stage 1 does not compute late
  fees — the officer enters whatever's already on record.

## Test cases for the accountant

These are also encoded as Vitest tests in `src/lib/calc.test.ts`. Re-key
each one into the calculator UI and verify the on-screen total matches.

| # | Outstanding | Rate            | Last payment | Pay-on date | Late fee | Days | Interest | **Total** |
|---|-------------|-----------------|--------------|-------------|----------|------|----------|-----------|
| 1 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-05-22  | $0       | 21   | $66.28   | **$2,466.28** |
| 2 | $2,400.00   | 4% per month    | 2026-05-01   | 2026-05-22  | $0       | 21   | $66.28   | **$2,466.28** (identical to #1) |
| 3 | $1,000.00   | 48% per year    | 2026-05-15   | 2026-05-15  | $0       | 0    | $0.00    | **$1,000.00** |
| 4 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-05-22  | $60.00   | 21   | $66.28   | **$2,526.28** |
| 5 | $100.00     | 1.825% per year | 2026-01-01   | 2026-01-02  | $0       | 1    | $0.01    | **$100.01** (half-up boundary — exact 0.5¢ rounds up) |
| 6 | $2,400.00   | 48% per year    | 2026-05-01   | 2026-06-15  | $0       | 45   | $142.03  | **$2,542.03** |
| 7 | $2,400.00   | 48% per year    | 2026-05-22   | 2026-05-01  | —        | —    | —        | **Error** — pay-on before last payment is rejected |

## ⚠️ Before deploying to the team

The accountant **MUST** verify at least 5 real past settlements against
this calculator. If any differ by more than 1 cent, **do not deploy until
investigated**. The test values above prove the engine matches the spec
this tool was built against; they do not prove the spec matches the Note
of Contract for every borrower. Independent verification is mandatory.

## Stack & layout

- Vite 8 + React 19 + TypeScript 6 (strict, `verbatimModuleSyntax`)
- Tailwind v4 via `@tailwindcss/vite` + shadcn/ui (new-york, neutral)
- react-hook-form + zod for form validation
- date-fns for calendar-day math
- idb for IndexedDB
- uuid for receipt IDs
- vitest + jsdom + @testing-library/jest-dom

```
src/
├── lib/
│   ├── calc.ts        ← pure engine (no React, lift-ready for CRM)
│   ├── calc.test.ts   ← 7 acceptance tests
│   ├── format.ts      ← S$ formatter, date helpers, Asia/Singapore
│   ├── db.ts          ← IndexedDB wrapper (audit log)
│   ├── schema.ts      ← zod form schema
│   ├── types.ts       ← CalculationRecord
│   └── utils.ts       ← cn() (shadcn)
├── hooks/
│   └── useLocalStorage.ts
└── components/
    ├── Calculator.tsx
    ├── History.tsx
    ├── Settings.tsx
    ├── OfficerNameModal.tsx
    ├── PrintReceipt.tsx
    └── ui/            ← shadcn primitives
```

## What this tool does NOT do

- No login, no server, no API. Officer name is a local label, not auth.
- No MLCB lookup, no aggregate cap logic.
- No WhatsApp / SMS sending.
- No legacy CRM integration.
- No multi-currency support (SGD only).
- No scheduled instalments — that's Stage 2.
