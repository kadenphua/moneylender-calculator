Fix the A1 end-of-month drift in the New Remaining Schedule.

The Original Schedule correctly anchors each row off loanStartDate
via addMonths(loanStartDate, i). The New Remaining Schedule chains
forward from prev, which causes permanent drift to earlier days
of the month once any clamping happens.

Re-anchor remainingSchedule's row dates the same way: each row's
dueDate = addMonths(loanStartDate, instalmentsAlreadyPaid + 1 + i)
where i is the 0-based index within remainingSchedule.

daysInPeriod for each row remains the difference from the previous
row's dueDate (or from payOnDate for the first row).

After the fix:
- Re-run pnpm test — all 14 tests must still pass.
- Re-run pnpm tsx scripts/edge-cases.ts — A1 should clear; no new
  flags should appear.
- Commit with a clear message.

Do not change anything else.