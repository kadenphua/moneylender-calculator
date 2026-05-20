import { format as formatDate, parse } from "date-fns";
import { centsToDisplay } from "./calc";

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
