Change the Principal portion field on Mode B from editable to
read-only, with an "Advanced: override" toggle that reveals editing
when the officer explicitly needs it.

CURRENT BEHAVIOUR
- Field is always editable.
- Auto-populates from (originalPrincipal × 100 / totalInstalments)
  rounded half-up to cents.
- Stops auto-overwriting once the officer manually edits it (via RHF
  dirtyFields).

NEW BEHAVIOUR

1. The field becomes READ-ONLY by default. It still auto-populates
   from (originalPrincipal × 100 / totalInstalments). Display the
   value as a static styled number, not an input.

2. Add a small toggle / link below the field: "Advanced: override
   auto-calculated value". When clicked, reveals an editable input
   pre-populated with the current auto value.

3. When the toggle is in "override" mode, the field accepts officer
   input. When toggled off (the default), it reverts to the auto
   value and ignores any previously-entered override.

4. The form submission uses whichever value is currently in effect
   (auto if toggle is off, override if toggle is on).

5. If the officer changes originalPrincipal or totalInstalments
   while the override toggle is OFF, the displayed auto value
   updates immediately. If the toggle is ON, the override value
   stays untouched (officer has explicitly taken control).

6. Visual styling for the read-only display: same neutral background
   as a disabled input, but with a small icon (lucide-react `Lock`
   or `Info`) hinting why it's not editable. Hover tooltip:
   "Auto-calculated from loan principal and instalments. Click
   'Advanced: override' below to edit."

7. The "Advanced: override" link styled small, less prominent than
   the form's main labels — it's the rarely-used escape hatch, not
   a primary field.

8. When the override toggle is ON, add a small warning text below
   the field in muted red:
   "Manual override active — make sure this matches the Note of
   Contract."

9. Remove the existing "(auto: $X.XX — change if rounding differs)"
   hint text since the new UI makes the auto behaviour obvious.

10. No changes to:
    - calc.ts engine (still receives principalPortionCents as a
      number, regardless of how the UI produced it)
    - Tests (the engine doesn't care about UI)
    - Schema (zod still validates principalPortionDollars >= 0 etc.)
    - Records stored in IndexedDB (no schema change, no migration)

11. Run pnpm test to confirm all 14 tests still pass after the
    UI refactor.

12. Run pnpm build to confirm typecheck + production build clean.

13. Commit with a clear message.

Add the Principal column back to both schedule tables (Original
Schedule and New Remaining Schedule).

CURRENT
Both tables in src/components/ScheduleComparison.tsx render 3 columns:
Due / Interest / Total.

NEW
Both tables render 4 columns: Due / Principal / Interest / Total.

DETAILS

1. Update ScheduleComparison.tsx — add the Principal column to both
   the screen variant and the receipt variant. Order: Due, Principal,
   Interest, Total. Principal column right-aligned and font-mono,
   matching the other numeric columns.

2. The principal cell uses centsToDisplay for the screen variant
   and centsToReceiptDisplay (S$) for the receipt variant.

3. For paid past rows in the Original Schedule (the ones marked ✓),
   show the principal value as normal — they're dimmed but the value
   is still visible.

4. For the "← paying today" row in the Original Schedule, show the
   principal value as normal.

5. Print CSS — the comparison still needs to fit in A4 landscape.
   Two 4-column tables side-by-side should still fit with the current
   1.2cm margins and 10pt font, but verify by:
   - Run pnpm build
   - If the build is clean, that's all we can verify without a real
     browser. Note in the commit that visual print preview verification
     is on the user.

6. No engine changes (calc.ts unchanged). No schema changes. No test
   changes (existing 14 tests still pass).

7. Run pnpm test and pnpm build before committing.

8. Commit with message "ui: restore Principal column in both schedule
   tables" and push to GitHub so Vercel auto-deploys.

Push the commit to GitHub after — `git push` — so Vercel auto-deploys
the change to the live URL.