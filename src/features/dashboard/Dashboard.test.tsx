import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { QuickActions } from "@/features/quick-actions/QuickActions";
import { Dashboard } from "./Dashboard";
import { loadDashboard } from "./queries";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

describe("Dashboard markup", () => {
  it("renders the current month with no data", async () => {
    const data = await loadDashboard(t.db, t.userId, { month: "2026-11", today: "2026-11-23" });
    const html = renderToStaticMarkup(<Dashboard data={data} currentMonth="2026-11" earliestMonth="2026-11" />);
    expect(html).toContain("November 2026");
    expect(html).toContain("Month to date");
    expect(html).toContain("Profit this month");
    expect(html).not.toContain("Back to this month");
    // Both arrows have nowhere to go: there is no earlier month with data, and next stops at the current month.
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(4);
    expect(html).toContain("No sales yet.");
    expect(html).toContain("Nothing in stock right now.");
    for (const href of [
      "/inventory?status=in_stock",
      "/listings?filter=below-minimum",
      "/listings?filter=stale",
      "/listings?filter=still-up",
      "/sales?filter=commission-owed",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("renders an earlier month with links forward and back to now", async () => {
    const data = await loadDashboard(t.db, t.userId, { month: "2026-09", today: "2026-11-23" });
    const html = renderToStaticMarkup(<Dashboard data={data} currentMonth="2026-11" earliestMonth="2026-08" />);
    expect(html).toContain("September 2026");
    expect(html).toContain("Full month");
    expect(html).toContain("Back to this month");
    expect(html).toContain("Profit in September 2026");
    expect(html).toContain('href="/?month=2026-08"');
    expect(html).toContain('href="/?month=2026-10"');
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("links the month before the current one forward to the bare home page", async () => {
    const data = await loadDashboard(t.db, t.userId, { month: "2026-10", today: "2026-11-23" });
    const html = renderToStaticMarkup(<Dashboard data={data} currentMonth="2026-11" earliestMonth="2026-08" />);
    expect(html).toMatch(/<a aria-label="Next month"[^>]* href="\/">/);
  });
});

describe("QuickActions markup", () => {
  it("starts closed, with the five actions in keyboard order", () => {
    const html = renderToStaticMarkup(<QuickActions />);
    expect(html).toContain('aria-expanded="false"');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(["/inventory/new", "/scan", "/listings/new", "/sales/new", "/lookup"]);
  });
});
