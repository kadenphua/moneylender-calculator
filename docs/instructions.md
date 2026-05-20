Swap the order of the two modes in the Mode selector and change
the default loaded mode.

CURRENT
- Mode selector shows: [ Full Settlement ] [ Scheduled Payment (Early) ]
- Default loaded on first open: Full Settlement (Mode A)

NEW
- Mode selector shows: [ Scheduled Payment (Early) ] [ Full Settlement ]
- Default loaded on first open: Scheduled Payment (Mode B)

DETAILS

1. In src/components/Calculator.tsx, swap the order of the two buttons
   in the mode selector so Scheduled Payment is on the left.

2. Change the initial useState for the active mode from
   'fullSettlement' to 'scheduled', so Mode B loads by default
   when the page first opens.

3. Do NOT rename either button. Labels stay as-is.

4. Do NOT change anything in calc.ts, schema.ts, types.ts, or db.ts
   — this is a UI-only change.

5. Do NOT change the History tab, Settings tab, or PrintReceipt
   component. The mode is determined per-calculation; only the
   default starting mode on the Calculator tab changes.

6. Run pnpm test — all 14 tests must still pass.

7. Run pnpm build — must be clean.

8. Commit with message:
   "ui: default Mode B on open, swap mode selector order"

9. Push to GitHub so Vercel auto-deploys.