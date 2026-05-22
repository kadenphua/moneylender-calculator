import { centsToDisplay } from "@/lib/calc";
import { centsToReceiptDisplay, formatPercent } from "@/lib/format";
import type {
  CalculationRecord,
  FullSettlementRecord,
  ScheduledPaymentRecord,
} from "@/lib/types";

// "How this was calculated" — a transparent working of the interest math,
// derived ENTIRELY from the already-computed outputs (days, dailyRate,
// interestCents, principalCents, newOutstandingCents, totalCents). It never
// recomputes, so the shown arithmetic always matches the headline figure.
// Used on both result panels (variant="screen") and both receipts
// (variant="receipt").

// "2,104.80" — money without a currency symbol, for equation operands.
function plainMoney(cents: number): string {
  return centsToDisplay(cents).replace("$", "");
}

// Format a rate number for display, trimming binary-float noise from the
// per-month → annual ×12 conversion (e.g. 4.1 × 12 = 49.199999… → "49.2").
function fmtRate(n: number): string {
  return String(Number(n.toFixed(6)));
}

export function CalculationBreakdown({
  record,
  variant,
}: {
  record: CalculationRecord;
  variant: "screen" | "receipt";
}) {
  const wrapperClass =
    variant === "screen"
      ? "rounded-md border bg-muted/30 p-3 space-y-1 text-xs font-mono"
      : "mt-4 space-y-1 text-sm";
  const headingClass =
    variant === "screen"
      ? "font-sans text-sm font-semibold text-foreground"
      : "font-semibold";

  return (
    <div className={wrapperClass}>
      <div className={headingClass}>How this was calculated</div>
      {record.mode === "scheduled" ? (
        <ScheduledLines record={record} />
      ) : (
        <FullSettlementLines record={record} />
      )}
      <div className={variant === "screen" ? "text-muted-foreground" : "italic"}>
        (figures rounded to the cent)
      </div>
    </div>
  );
}

function ScheduledLines({ record }: { record: ScheduledPaymentRecord }) {
  const { inputs, outputs } = record;
  const rate = fmtRate(inputs.annualRatePercent);
  const dailyPct = formatPercent(outputs.dailyRate, 6);
  return (
    <>
      <Row
        label="Outstanding balance"
        value={centsToReceiptDisplay(inputs.outstandingCents)}
      />
      <Row label="Annual rate" value={`${rate}%`} />
      <Row label={`Daily rate (${rate}% ÷ 360)`} value={dailyPct} />
      <Row label="Days (30/360)" value={String(outputs.days)} />
      <Eq>
        Interest = {plainMoney(inputs.outstandingCents)} × {dailyPct} ×{" "}
        {outputs.days} = {centsToReceiptDisplay(outputs.interestCents)}
      </Eq>
      <Eq>
        Principal = {plainMoney(inputs.monthlyPaymentCents)} −{" "}
        {plainMoney(outputs.interestCents)} ={" "}
        {centsToReceiptDisplay(outputs.principalCents)}
      </Eq>
      <Eq>
        New outstanding = {plainMoney(inputs.outstandingCents)} −{" "}
        {plainMoney(outputs.principalCents)} ={" "}
        {centsToReceiptDisplay(outputs.newOutstandingCents)}
      </Eq>
    </>
  );
}

function FullSettlementLines({ record }: { record: FullSettlementRecord }) {
  const { inputs, outputs } = record;
  const annual =
    inputs.rateUnit === "annual" ? inputs.ratePercent : inputs.ratePercent * 12;
  const rate = fmtRate(annual);
  const dailyPct = formatPercent(outputs.dailyRate, 6);
  const hasLateFee = outputs.outstandingLateFeeCents > 0;
  return (
    <>
      <Row
        label="Outstanding balance"
        value={centsToReceiptDisplay(inputs.outstandingCents)}
      />
      <Row label="Annual rate" value={`${rate}% per year`} />
      <Row label={`Daily rate (${rate}% ÷ 360)`} value={dailyPct} />
      <Row label="Days (30/360)" value={String(outputs.days)} />
      <Eq>
        Interest = {plainMoney(inputs.outstandingCents)} × {dailyPct} ×{" "}
        {outputs.days} = {centsToReceiptDisplay(outputs.interestCents)}
      </Eq>
      <Row
        label="(+ late fee on record)"
        value={centsToReceiptDisplay(outputs.outstandingLateFeeCents)}
      />
      <Eq>
        Settlement total = {plainMoney(inputs.outstandingCents)} +{" "}
        {plainMoney(outputs.interestCents)}
        {hasLateFee ? ` + ${plainMoney(outputs.outstandingLateFeeCents)}` : ""} ={" "}
        {centsToReceiptDisplay(outputs.totalCents)}
      </Eq>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Eq({ children }: { children: React.ReactNode }) {
  return <div className="pt-0.5">{children}</div>;
}
