import { centsToDisplay } from "@/lib/calc";
import { centsToReceiptDisplay } from "@/lib/format";
import { formatYmdShort, formatYmdReceipt } from "@/lib/format";
import type { ScheduleRowStored } from "@/lib/types";

interface Props {
  originalSchedule: ScheduleRowStored[];
  remainingSchedule: ScheduleRowStored[];
  instalmentsAlreadyPaid: number;
  variant?: "screen" | "receipt";
}

type Marker = "paid" | "today" | null;

export function ScheduleComparison({
  originalSchedule,
  remainingSchedule,
  instalmentsAlreadyPaid,
  variant = "screen",
}: Props) {
  if (originalSchedule.length === 0 && remainingSchedule.length === 0) {
    return null;
  }

  const todayRowNumber = instalmentsAlreadyPaid + 1;

  const originalFutureTotal = originalSchedule
    .filter((r) => r.rowNumber > todayRowNumber)
    .reduce((s, r) => s + r.totalCents, 0);
  const newTotal = remainingSchedule.reduce((s, r) => s + r.totalCents, 0);
  const savingsCents = originalFutureTotal - newTotal;

  const formatMoney =
    variant === "receipt" ? centsToReceiptDisplay : centsToDisplay;
  const formatDue = variant === "receipt" ? formatYmdReceipt : formatYmdShort;

  return (
    <div
      className={
        variant === "receipt"
          ? "schedule-comparison-receipt space-y-4"
          : "space-y-3"
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2">
            Original Schedule (from loan agreement)
          </p>
          <ScheduleTable
            rows={originalSchedule}
            markerFor={(row) => {
              if (row.rowNumber < todayRowNumber) return "paid";
              if (row.rowNumber === todayRowNumber) return "today";
              return null;
            }}
            variant={variant}
            formatMoney={formatMoney}
            formatDue={formatDue}
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2">
            New Remaining Schedule (recalculated)
          </p>
          <ScheduleTable
            rows={remainingSchedule}
            markerFor={() => null}
            variant={variant}
            formatMoney={formatMoney}
            formatDue={formatDue}
          />
        </div>
      </div>

      {savingsCents > 0 ? (
        <p
          className={
            variant === "receipt" ? "text-sm font-semibold" : "text-sm"
          }
        >
          Total saving across remaining schedule:{" "}
          <span className="font-semibold">{formatMoney(savingsCents)}</span>
        </p>
      ) : null}
    </div>
  );
}

interface ScheduleTableProps {
  rows: ScheduleRowStored[];
  markerFor: (row: ScheduleRowStored) => Marker;
  variant: "screen" | "receipt";
  formatMoney: (cents: number) => string;
  formatDue: (ymd: string) => string;
}

function ScheduleTable({
  rows,
  markerFor,
  variant,
  formatMoney,
  formatDue,
}: ScheduleTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic border rounded-md p-3">
        No rows.
      </div>
    );
  }

  const headBg = variant === "receipt" ? "" : "bg-muted/40";

  return (
    <div
      className={
        variant === "receipt"
          ? "border border-black"
          : "rounded-md border overflow-hidden"
      }
    >
      <table className="w-full text-sm">
        <thead className={headBg}>
          <tr
            className={
              variant === "receipt" ? "border-b border-black" : ""
            }
          >
            <th className="text-left px-2 py-1.5">Due</th>
            <th className="text-right px-2 py-1.5">Interest</th>
            <th className="text-right px-2 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const marker = markerFor(row);
            return (
              <tr
                key={row.rowNumber}
                className={marker === "paid" ? "opacity-60" : ""}
              >
                <td className="px-2 py-1 font-mono text-xs whitespace-nowrap">
                  {formatDue(row.dueDate)}
                  {marker === "paid" ? (
                    <span className="ml-2">✓</span>
                  ) : marker === "today" ? (
                    <span
                      className={
                        variant === "receipt"
                          ? "ml-2 font-semibold"
                          : "ml-2 text-primary"
                      }
                    >
                      ← paying today
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {formatMoney(row.interestCents)}
                </td>
                <td className="px-2 py-1 text-right font-mono font-semibold">
                  {formatMoney(row.totalCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
