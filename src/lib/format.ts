/**
 * Formatters and parsers for money, percentages and dates.
 * Money is integer cents and percentages are basis points. Parsing works on the digits of the string, never on floats.
 * These are safe to import from Server and Client Components.
 */

const MINUS = "−";

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatCentsOptions {
  /** If true, the cents are dropped and the amount is rounded half up to the dollar. Dashboard tiles use this. */
  whole?: boolean;
  /** If true, positive amounts get a leading "+". Zero gets no sign. */
  showPlus?: boolean;
}

/** Formats integer cents as dollars: 1800 gives "$18.00", -690 gives "−$6.90", and 186400 with `whole` gives "$1,864". */
export function formatCents(cents: number, options: FormatCentsOptions = {}): string {
  if (!Number.isSafeInteger(cents)) return "";
  const absolute = Math.abs(cents);
  const sign = cents < 0 ? MINUS : options.showPlus && cents > 0 ? "+" : "";
  if (options.whole) {
    return `${sign}$${groupThousands(String(Math.floor((absolute + 50) / 100)))}`;
  }
  const dollars = Math.floor(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, "0");
  return `${sign}$${groupThousands(String(dollars))}.${remainder}`;
}

/** Formats integer cents for an input field, with no "$" or thousands separators: 4499 gives "44.99". */
export function centsToInputValue(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "";
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Parses what a person types for a dollar amount into integer cents.
 * Accepts "44.99", "$44.99", "1,234.5", "44" and ".5".
 * Returns null for an empty string, a negative amount, more than two decimals, or anything else.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return null;
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Formats basis points as a percentage.
 * By default trailing zeros are dropped: 2000 gives "20%", 1250 gives "12.5%", 1325 gives "13.25%".
 * With `fractionDigits` the value is rounded half up to that many decimals: 4763 with 1 gives "47.6%".
 */
export function formatBps(bps: number, options: { fractionDigits?: 0 | 1 | 2 } = {}): string {
  if (!Number.isSafeInteger(bps)) return "";
  const sign = bps < 0 ? MINUS : "";
  const absolute = Math.abs(bps);
  if (options.fractionDigits === undefined) {
    const fraction = String(absolute % 100).padStart(2, "0").replace(/0+$/, "");
    return `${sign}${Math.floor(absolute / 100)}${fraction ? `.${fraction}` : ""}%`;
  }
  const scale = 10 ** (2 - options.fractionDigits);
  const rounded = Math.floor((absolute + scale / 2) / scale);
  const unit = 10 ** options.fractionDigits;
  const whole = Math.floor(rounded / unit);
  const fraction =
    options.fractionDigits === 0 ? "" : `.${String(rounded % unit).padStart(options.fractionDigits, "0")}`;
  return `${rounded === 0 ? "" : sign}${whole}${fraction}%`;
}

/** Formats basis points for an input field, with no "%": 1250 gives "12.5". */
export function bpsToInputValue(bps: number): string {
  return formatBps(bps).replace("%", "").replace(MINUS, "-");
}

/**
 * Parses what a person types for a percentage into basis points.
 * Accepts "12.5", "12.5%" and "20 %". Returns null for an empty string, more than two decimals, or a value over 100%.
 */
export function parsePercentToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return null;
  const bps = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(bps) && bps <= 10_000 ? bps : null;
}

/** Formats a whole number with thousands separators: 1864 gives "1,864". */
export function formatCount(count: number): string {
  if (!Number.isSafeInteger(count)) return "";
  return `${count < 0 ? MINUS : ""}${groupThousands(String(Math.abs(count)))}`;
}

/**
 * The time zone used for "today" and for showing timestamps. Set NEXT_PUBLIC_APP_TIME_ZONE to an IANA name.
 * It defaults to UTC so the server and the browser always agree.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "UTC";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date as "YYYY-MM-DD". This is how `date` columns come back from the database. */
export type IsoDate = string;

function isoDateToUtc(date: IsoDate): Date | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(utc.getTime()) ? null : utc;
}

/** The calendar date of a timestamp in the app time zone, as "YYYY-MM-DD". */
export function toIsoDate(timestamp: Date): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today's date in the app time zone, as "YYYY-MM-DD". */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

function normalizeDate(value: IsoDate | Date): Date | null {
  return value instanceof Date ? isoDateToUtc(toIsoDate(value)) : isoDateToUtc(value);
}

/** Formats a date as "Nov 14, 2026". Takes a "YYYY-MM-DD" string or a timestamp. Returns "" if it cannot be read. */
export function formatDate(value: IsoDate | Date | null | undefined): string {
  if (value == null) return "";
  const date = normalizeDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Formats a date without the year, as "Nov 22". */
export function formatShortDate(value: IsoDate | Date | null | undefined): string {
  if (value == null) return "";
  const date = normalizeDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date);
}

/** Formats a month as "November 2026". Takes "YYYY-MM" or "YYYY-MM-DD". */
export function formatMonth(value: string): string {
  const date = isoDateToUtc(value.length === 7 ? `${value}-01` : value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. Returns null if either date cannot be read. */
export function daysBetween(from: IsoDate | Date, to: IsoDate | Date): number | null {
  const start = normalizeDate(from);
  const end = normalizeDate(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Adds days to a "YYYY-MM-DD" date. Returns the input unchanged if it cannot be read. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const utc = isoDateToUtc(date);
  if (!utc) return date;
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
