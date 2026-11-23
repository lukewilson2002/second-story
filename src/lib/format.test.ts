import { describe, expect, it } from "vitest";
import {
  addDays,
  bpsToInputValue,
  centsToInputValue,
  daysBetween,
  formatBps,
  formatCents,
  formatCount,
  formatDate,
  formatMonth,
  formatShortDate,
  parseDollarsToCents,
  parsePercentToBps,
  toIsoDate,
} from "./format";

describe("formatCents", () => {
  it("formats dollars and cents", () => {
    expect(formatCents(1800)).toBe("$18.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
  });
  it("uses a real minus sign for negatives", () => {
    expect(formatCents(-690)).toBe("−$6.90");
  });
  it("rounds to whole dollars on request", () => {
    expect(formatCents(186400, { whole: true })).toBe("$1,864");
    expect(formatCents(186450, { whole: true })).toBe("$1,865");
    expect(formatCents(186449, { whole: true })).toBe("$1,864");
  });
  it("shows a plus on request", () => {
    expect(formatCents(2240, { showPlus: true })).toBe("+$22.40");
    expect(formatCents(0, { showPlus: true })).toBe("$0.00");
    expect(formatCents(-100, { showPlus: true })).toBe("−$1.00");
  });
  it("formats for inputs", () => {
    expect(centsToInputValue(4499)).toBe("44.99");
    expect(centsToInputValue(500)).toBe("5.00");
  });
});

describe("parseDollarsToCents", () => {
  it("parses typed amounts", () => {
    expect(parseDollarsToCents("44.99")).toBe(4499);
    expect(parseDollarsToCents("$44.99")).toBe(4499);
    expect(parseDollarsToCents("1,234.5")).toBe(123450);
    expect(parseDollarsToCents("44")).toBe(4400);
    expect(parseDollarsToCents(".5")).toBe(50);
    expect(parseDollarsToCents("5.")).toBe(500);
    expect(parseDollarsToCents(" 0 ")).toBe(0);
  });
  it("does not use float math", () => {
    expect(parseDollarsToCents("0.29")).toBe(29);
    expect(parseDollarsToCents("1.15")).toBe(115);
    expect(parseDollarsToCents("8.07")).toBe(807);
    expect(parseDollarsToCents("19.99")).toBe(1999);
  });
  it("rejects what it cannot read", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents(".")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1e3")).toBeNull();
  });
});

describe("percentages", () => {
  it("formats basis points, trimming zeros", () => {
    expect(formatBps(2000)).toBe("20%");
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(1325)).toBe("13.25%");
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(-250)).toBe("−2.5%");
  });
  it("rounds to fixed decimals", () => {
    expect(formatBps(4763, { fractionDigits: 1 })).toBe("47.6%");
    expect(formatBps(3119, { fractionDigits: 1 })).toBe("31.2%");
    expect(formatBps(4765, { fractionDigits: 1 })).toBe("47.7%");
    expect(formatBps(4750, { fractionDigits: 0 })).toBe("48%");
    expect(formatBps(2000, { fractionDigits: 2 })).toBe("20.00%");
    expect(formatBps(-2, { fractionDigits: 1 })).toBe("0.0%");
  });
  it("parses typed percentages", () => {
    expect(parsePercentToBps("12.5")).toBe(1250);
    expect(parsePercentToBps("20%")).toBe(2000);
    expect(parsePercentToBps("20 %")).toBe(2000);
    expect(parsePercentToBps("100")).toBe(10000);
    expect(parsePercentToBps("0")).toBe(0);
    expect(parsePercentToBps("13.25")).toBe(1325);
  });
  it("rejects what it cannot read", () => {
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("100.01")).toBeNull();
    expect(parsePercentToBps("12.345")).toBeNull();
    expect(parsePercentToBps("-1")).toBeNull();
  });
  it("formats for inputs", () => {
    expect(bpsToInputValue(1250)).toBe("12.5");
    expect(bpsToInputValue(2000)).toBe("20");
  });
});

describe("counts and dates", () => {
  it("formats counts", () => {
    expect(formatCount(1864)).toBe("1,864");
    expect(formatCount(0)).toBe("0");
  });
  it("formats ISO dates without shifting the day", () => {
    expect(formatDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatShortDate("2026-11-22")).toBe("Nov 22");
    expect(formatMonth("2026-11")).toBe("November 2026");
    expect(formatMonth("2026-06-30")).toBe("June 2026");
  });
  it("returns an empty string for missing or bad dates", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("nope")).toBe("");
  });
  it("formats timestamps by their calendar date", () => {
    expect(toIsoDate(new Date("2026-11-14T12:00:00Z"))).toBe("2026-11-14");
    expect(formatDate(new Date("2026-11-14T12:00:00Z"))).toBe("Nov 14, 2026");
  });
  it("counts days and adds days", () => {
    expect(daysBetween("2026-11-14", "2026-11-23")).toBe(9);
    expect(daysBetween("2026-11-23", "2026-11-14")).toBe(-9);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("bad", "2026-03-01")).toBeNull();
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
