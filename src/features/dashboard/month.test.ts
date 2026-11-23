import { describe, expect, it } from "vitest";
import { addMonths, monthHref, monthRange, monthsEndingAt, resolveMonth, weekStartOf, weeksEndingAt } from "./month";

describe("month helpers", () => {
  it("moves across year ends", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
  });

  it("opens on the current month unless a valid earlier month is asked for", () => {
    expect(resolveMonth(undefined, "2026-11", "2026-05")).toBe("2026-11");
    expect(resolveMonth("2026-09", "2026-11", "2026-05")).toBe("2026-09");
    expect(resolveMonth("2026-12", "2026-11", "2026-05")).toBe("2026-11");
    expect(resolveMonth("2026-13", "2026-11", "2026-05")).toBe("2026-11");
    expect(resolveMonth("nope", "2026-11", "2026-05")).toBe("2026-11");
    expect(resolveMonth("2025-01", "2026-11", "2026-05")).toBe("2026-05");
  });

  it("gives a half-open date range", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", endExclusive: "2028-03-01" });
  });

  it("lists the months ending at one", () => {
    expect(monthsEndingAt("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("starts weeks on Monday", () => {
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16");
    expect(weekStartOf("2026-11-20")).toBe("2026-11-16");
    expect(weeksEndingAt("2026-11-25", 3)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
  });

  it("links the current month to the bare home page", () => {
    expect(monthHref("2026-11", "2026-11")).toBe("/");
    expect(monthHref("2026-10", "2026-11")).toBe("/?month=2026-10");
  });
});
