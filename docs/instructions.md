Improve Mode B form ergonomics in one commit. UI-only — no math
changes, no test changes (engine tests must still pass).

CHANGES (all in the Mode B form)

1. HIDE "Last payment date" WHEN INSTALMENTS PAID = 0

   When instalmentsAlreadyPaid === 0, hide the "Last payment date"
   field. Internally use loanStartDate as the lastPaymentDate when
   submitting.

   When instalmentsAlreadyPaid >= 1, show the field as today;
   required.

   Below the "Instalments already paid" field, when its value is 0,
   show inline note (small, muted):
     "First payment for this loan — interest calculated from the
      loan start date."

   If officer toggles between 0 and >=1 values, react-hook-form
   should preserve any value they previously typed in the
   last-payment-date field so it isn't lost.

2. REMEMBER RATE AND RATE UNIT BETWEEN SESSIONS

   On form submit, save ratePercent and rateUnit to localStorage:
     keys: lastUsedRatePercent, lastUsedRateUnit
   On form mount, pre-fill from these if present.
   Defaults if no localStorage value: ratePercent blank, rateUnit
   'monthly'.

   Beside the rate field when it's pre-filled from localStorage,
   show a tiny muted label: "(remembered)" — so the officer
   notices and can change if needed.

3. SCHEDULE-DERIVED OUTSTANDING CROSS-REFERENCE

   When the officer has filled in:
     originalPrincipal, totalInstalments, instalmentsAlreadyPaid,
     ratePercent, rateUnit, monthlyPayment
   ...compute the schedule-derived outstanding by amortising
   instalmentsAlreadyPaid rows forward from originalPrincipal
   using the per-row amortisation math from calc.ts.

   Show this value as a hint under the "Outstanding principal"
   input:
     "Schedule says: $X,XXX.XX. If your CRM shows a different
      number, use the CRM value."

   This hint does NOT auto-fill the outstanding field. The
   officer types the real outstanding from the CRM. The hint is
   purely a sanity check.

   If the typed outstanding differs from the schedule-derived
   value by more than $1.00, change the hint text color to amber
   (muted warning, not red). This is a soft signal, not an error.

   If any of the prerequisite fields are blank, hide the hint
   entirely.

4. TAB ORDER

   Set tabIndex on every input in Mode B so the officer can tab
   through in the natural top-to-bottom order:
     borrowerRef → originalPrincipal → loanStartDate →
     totalInstalments → instalmentsAlreadyPaid →
     outstandingPrincipal → ratePercent → rateUnit →
     monthlyPayment → lastPaymentDate (if visible) → payOnDate →
     Calculate button.

   The radio/segment toggle for rateUnit should be reachable by
   tab + arrow keys.

   Verify by tabbing through the form on the dev server — it
   should hit every field in order with no detours into header
   or unrelated elements.

5. CURRENCY FORMATTING ON DOLLAR FIELDS

   For the four dollar-amount fields:
     originalPrincipal, outstandingPrincipal, monthlyPayment
   ...apply a thousands-separator + 2-decimal formatter on blur.

   Behaviour:
     - Officer types "1000" → on blur, field shows "1,000.00"
     - Officer types "1000.5" → on blur, field shows "1,000.50"
     - On focus, the formatter strips back to raw number for easy
       editing
     - Internally the value is still a number, not a formatted
       string — react-hook-form's value is numeric

   Use a small custom formatter, not a library. No new dependencies.

6. BETTER LABELS

   Rename in Mode B only:
     "Original loan principal" → "Loan amount"
     "Outstanding principal" → "Current outstanding"
     "Instalments already paid" → "Instalments paid so far"
     "Pay-on date" → "Today's date (or future date if quoting)"
     "Monthly payment amount" → "Monthly payment (from CRM)"

   Mode A labels unchanged.

NO CHANGES TO

- src/lib/calc.ts (math unchanged)
- src/lib/calc.test.ts (tests unchanged)
- Mode A form
- Print receipt structure
- IndexedDB schema
- Schedule comparison component

PERSISTED RECORD

After form submission, the stored CalculationRecord MUST still
include a valid lastPaymentDate (set to loanStartDate when
instalmentsAlreadyPaid === 0). This keeps the audit log complete
and consistent.

In History.tsx detail dialog for Mode B records, show
lastPaymentDate as today, but if it equals loanStartDate, append
"(= loan start date)" to the displayed value.

STEPS

1. Update src/components/ModeBScheduledPayment.tsx with all six
   changes.

2. Update src/components/History.tsx for the lastPaymentDate
   annotation.

3. Run pnpm test — all 14 tests still pass.

4. Run pnpm build — clean.

5. Manual checks (note these are for the user, you don't run them):
   - With instalmentsPaid=0, last-payment-date is hidden, inline
     note is visible.
   - With instalmentsPaid=2, last-payment-date is visible.
   - Toggling instalmentsPaid between 0 and 2 preserves any
     date the officer typed.
   - After submitting a calculation, refreshing the page, the
     rate field is pre-filled with "(remembered)" annotation.
   - With all other fields filled, the outstanding field shows
     "Schedule says: $X.XX" hint.
   - Tabbing through the form hits every field in correct order.
   - Typing 1000 in the principal field and tabbing away shows
     "$1,000.00".

6. Commit with message:
   "ui: streamline Mode B form (hide unused fields, remember
    rate, cross-reference outstanding, tab order, formatting,
    labels)"

7. Push to GitHub for Vercel auto-deploy.

STOPPING POINT

Report after pushing. Include:
- Commit hash
- Any silent default resolved (e.g., what counts as "more than
  $1.00" for the warning color)
- Anything in the spec that was ambiguous

DO NOT TOUCH

- Mode A
- Anything related to calc.ts or tests
- Schedule comparison or print receipt
- DB schema