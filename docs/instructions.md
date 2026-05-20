Show reciprocal rate beside the interest rate field on Mode B.

When the officer enters a rate and selects a unit, display the
equivalent in the other unit below the rate field as a small
muted hint line.

BEHAVIOUR

If rateUnit === 'annual' and ratePercent is a positive number:
  Display: "= [X.XX]% per month"
  where X.XX = ratePercent / 12, rounded to 2 decimal places.

If rateUnit === 'monthly' and ratePercent is a positive number:
  Display: "= [X.XX]% per year"
  where X.XX = ratePercent × 12, rounded to 2 decimal places.

If ratePercent is empty, 0, or invalid, display nothing.

DO NOT auto-convert the entered number when the unit toggle
changes. The number the officer typed stays as-is. Only the
reciprocal display updates.

VISUAL

Same style as the existing field hints (e.g. "From the CRM or
Note of Contract" under the monthly payment field, "Schedule
says..." under outstanding). Small text, muted color, sits
directly below the rate input.

Example placement:
  Interest rate (%)               Unit
  [ 39             ]              [ Per month ] [ Per year ]
  = 3.25% per month               ← THIS LINE IS NEW

NO OTHER CHANGES

- Engine math is unaffected. The rate conversion is handled by
  calc.ts's annualToDaily / monthlyToDaily helpers already.
- No new dependencies.
- Mode A is unaffected (it has the same rate input, but for
  this commit only update Mode B; we can mirror to Mode A
  separately).
- Schema is unaffected.
- Tests are unaffected.

STEPS

1. Update src/components/ModeBScheduledPayment.tsx:
   - Watch ratePercent and rateUnit
   - Compute the reciprocal value with simple JS
   - Render the muted hint line below the rate input

2. Run pnpm test, pnpm build.

3. Commit:
   "ui(modeB): show reciprocal interest rate beside input"

4. Push to GitHub.

VERIFY ON DEV SERVER BEFORE COMMITTING

- "Per year" + 39 → shows "= 3.25% per month"
- "Per month" + 3.25 → shows "= 39% per year"
- Empty rate → no hint
- 0 rate → no hint
- Switching unit while rate is entered: number stays, hint
  updates to reflect new interpretation