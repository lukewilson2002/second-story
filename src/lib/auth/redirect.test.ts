import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeNextPath("/inventory")).toBe("/inventory");
    expect(safeNextPath("/listings?filter=stale")).toBe("/listings?filter=stale");
    expect(safeNextPath("/inventory/new?title=Chrono%20Trigger&identifier=0123#photos")).toBe(
      "/inventory/new?title=Chrono%20Trigger&identifier=0123#photos",
    );
  });

  it("falls back to home when there is nothing to open", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\u0000/evil.example",
    "/.//evil.example",
    "/x/..//evil.example",
    "javascript:alert(1)",
    "evil.example",
    " /inventory",
  ])("refuses %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
