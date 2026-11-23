import { addDays, type IsoDate } from "@/lib/format";

/** A calendar month as "YYYY-MM". */
export type MonthKey = string;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The month a "YYYY-MM-DD" date falls in. */
export function monthOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

/** Moves a month forward or back. `addMonths("2026-01", -1)` gives "2025-12". */
export function addMonths(month: MonthKey, count: number): MonthKey {
  const match = MONTH_KEY.exec(month);
  if (!match) return month;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + count;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Reads the `month` search parameter.
 * If it is missing, malformed or in the future, the current month is used.
 * If it is before `earliest`, `earliest` is used, so the previous arrow has a place to stop.
 */
export function resolveMonth(param: string | undefined, currentMonth: MonthKey, earliest: MonthKey): MonthKey {
  if (!param || !MONTH_KEY.test(param) || param > currentMonth) return currentMonth;
  // "YYYY-MM" strings sort the same as the months they stand for.
  return param < earliest ? earliest : param;
}

export interface DateRange {
  /** First day, inclusive. */
  start: IsoDate;
  /** The day after the last day. */
  endExclusive: IsoDate;
}

/** The first day of the month up to, but not including, the first day of the next. */
export function monthRange(month: MonthKey): DateRange {
  return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}

/** The `count` months ending with `month`, oldest first. */
export function monthsEndingAt(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) => addMonths(month, index - (count - 1)));
}

/** The Monday of the week a date falls in. Postgres and ISO weeks both start on Monday. */
export function weekStartOf(date: IsoDate): IsoDate {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** The Mondays of the `count` weeks ending with the week `date` falls in, oldest first. */
export function weeksEndingAt(date: IsoDate, count: number): IsoDate[] {
  const last = weekStartOf(date);
  return Array.from({ length: count }, (_, index) => addDays(last, (index - (count - 1)) * 7));
}

/** The link for a month. The current month is the bare home page, so the dashboard always opens on it. */
export function monthHref(month: MonthKey, currentMonth: MonthKey): string {
  return month === currentMonth ? "/" : `/?month=${month}`;
}
