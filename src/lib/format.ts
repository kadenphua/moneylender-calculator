import { format as formatDate, parse } from "date-fns";
import { centsToDisplay, type RateUnit } from "./calc";

export function centsToReceiptDisplay(cents: number): string {
  return "S" + centsToDisplay(cents);
}

export function parseYmdLocal(ymd: string): Date {
  return parse(ymd, "yyyy-MM-dd", new Date());
}

export function dateToYmdLocal(date: Date): string {
  return formatDate(date, "yyyy-MM-dd");
}

export function todayYmdLocal(): string {
  return formatDate(new Date(), "yyyy-MM-dd");
}

export function formatYmdReceipt(ymd: string): string {
  return formatDate(parseYmdLocal(ymd), "dd MMM yyyy");
}

export function formatYmdShort(ymd: string): string {
  return formatDate(parseYmdLocal(ymd), "dd MMM yyyy");
}

const sgPartsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function partsLookup(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function formatSgDateTime(date: Date): string {
  const parts = sgPartsFmt.formatToParts(date);
  const y = partsLookup(parts, "year");
  const m = partsLookup(parts, "month");
  const d = partsLookup(parts, "day");
  const hh = partsLookup(parts, "hour");
  const mm = partsLookup(parts, "minute");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function formatPercent(decimal: number, fractionDigits: number): string {
  return `${(decimal * 100).toFixed(fractionDigits)}%`;
}

function stripTrailingZeros(fixed: string): string {
  // "39.00" -> "39", "3.25" -> "3.25", "39.50" -> "39.5".
  return fixed.replace(/\.?0+$/, "") || "0";
}

// Convert a rate to its equivalent in the OTHER unit and format it as a
// muted helper string: "Per month" + 3.25 -> "= 39% per year", and
// "Per year" + 39 -> "= 3.25% per month". Rounded to 2 dp with natural
// trailing zeros dropped. Returns null when the rate is empty, zero, or
// invalid so callers render nothing. Shared by Mode A and Mode B so the
// two behave identically.
export function formatEquivalentRate(
  ratePercent: unknown,
  rateUnit: RateUnit,
): string | null {
  if (
    typeof ratePercent !== "number" ||
    !Number.isFinite(ratePercent) ||
    ratePercent <= 0
  ) {
    return null;
  }
  if (rateUnit === "annual") {
    const perMonth = ratePercent / 12;
    return `= ${stripTrailingZeros(perMonth.toFixed(2))}% per month`;
  }
  const perYear = ratePercent * 12;
  return `= ${stripTrailingZeros(perYear.toFixed(2))}% per year`;
}
