import { formatMonth, formatShortDate, type IsoDate } from "@/lib/format";
import type { MonthKey } from "./month";

const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });

/** "Nov" for "2026-11". */
export function shortMonthLabel(month: MonthKey): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : SHORT_MONTH.format(date);
}

/** "November 2026" for "2026-11". */
export function longMonthLabel(month: MonthKey): string {
  return formatMonth(month);
}

/** "Nov 16" for the week that starts on that Monday. */
export function weekLabel(weekStart: IsoDate): string {
  return formatShortDate(weekStart);
}
