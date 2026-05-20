TWO BUGS TO FIX IN MODE B FORM

BUG 1: Calculate button stays disabled with valid inputs

When instalmentsAlreadyPaid === 0, the "Last payment date" field
is correctly hidden, but the Calculate button remains disabled
even when all other fields are filled correctly.

DIAGNOSIS

The likely cause: the zod schema still validates lastPaymentDate
as required, but the UI hides the field. Form-level validation
fails silently (no visible error message because no field is
rendered to show it against), and react-hook-form keeps the
Calculate button disabled.

FIX

Update src/lib/schema.ts so that when instalmentsAlreadyPaid === 0:
- lastPaymentDate is OPTIONAL (zod superRefine, not required)
- The form's submit handler is the place that substitutes
  loanStartDate for lastPaymentDate when paid=0

When instalmentsAlreadyPaid >= 1:
- lastPaymentDate is REQUIRED as before
- The refinement `lastPaymentDate >= loanStartDate` still applies

Make sure react-hook-form's `mode: 'onChange'` is set (or
'onBlur') so the form re-validates immediately when
instalmentsAlreadyPaid changes from blank to 0 to a positive
integer. This way the button enables/disables responsively.

After the fix, verify in the dev server:
- Set paid=0, fill all other fields, button should be ACTIVE.
- Set paid=2, leave lastPaymentDate blank, button should be
  DISABLED with a visible "Required" error on the
  lastPaymentDate field.
- Set paid=2, fill lastPaymentDate, button should be ACTIVE.

BUG 2: Outstanding field is editable and shows redundant hint
when paid = 0

When instalmentsAlreadyPaid === 0, the borrower has by definition
made no payments, so the current outstanding always equals the
loan amount. The officer typing the same number in twice is
busywork, and the "Schedule says: $5,000.00" hint is redundant.

FIX

In src/components/ModeBScheduledPayment.tsx, when
instalmentsAlreadyPaid === 0:
- The "Current outstanding ($)" input becomes READ-ONLY
- Its value is auto-set to whatever loan amount is currently
  entered, watched reactively (if loan amount changes from
  $5,000 to $6,000, the outstanding field auto-updates to $6,000)
- The cross-reference hint ("Schedule says: ...") is HIDDEN
- Style the field with the same disabled/read-only appearance as
  the monthly payment field has when read-only

When instalmentsAlreadyPaid >= 1:
- The field is editable as today
- The cross-reference hint reappears

Add a small visual cue when the field is auto-set: muted text
below the field saying "Auto-filled — no payments made yet."

VERIFY VALIDATION SCHEMA IS CONSISTENT WITH THIS BEHAVIOUR

If the schema validates that outstanding > 0 and <= loan amount,
that should still pass when outstanding === loan amount (since
loan amount is required to be > 0).

STEPS

1. Update src/lib/schema.ts:
   - lastPaymentDate conditional via superRefine on
     instalmentsAlreadyPaid
   - existing refinements stay intact

2. Update src/components/ModeBScheduledPayment.tsx:
   - Add watched value for instalmentsAlreadyPaid
   - When 0, make outstanding read-only and auto-track loan amount
   - When 0, hide the cross-reference hint
   - When >=1, make outstanding editable and show hint as today
   - Add the "Auto-filled — no payments made yet." muted text

3. Run pnpm test — all 14 tests must still pass.

4. Run pnpm build — clean.

5. Verify in dev server:
   a. paid=0 + all other fields → Calculate button ACTIVE
   b. paid=2 + lastPaymentDate empty → button DISABLED, visible
      error on lastPaymentDate
   c. paid=2 + lastPaymentDate filled → button ACTIVE
   d. Setting outstanding while paid=0 should be impossible (field
      is read-only)
   e. Changing loan amount while paid=0 should auto-update
      outstanding

6. Commit with message:
   "fix(ui): enable Calculate when paid=0; auto-fill outstanding
    for new loans"

7. Push to GitHub for Vercel auto-deploy.

ALSO — DOUBLE-CHECK FOR OTHER FORM VALIDATION BUGS

While in the schema and form code, look for any other field that
might be silently failing validation:
- Loan start date format
- Today's date / pay-on date defaults
- Rate field handling 0% or empty
- Monthly payment field handling

Report anything you find that looks suspicious. If you spot a bug
that wasn't asked for, flag it and ask before fixing — don't
spontaneously change behaviour.

STOPPING POINT

Report after the commit and push. Include:
- The commit hash
- A list of test scenarios verified
- Any other validation issue you noticed