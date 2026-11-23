import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { lookupInSource, lookupPrices } from "./service";
import { PriceSourceError, type PriceSource, type SourceSearch } from "./types";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

function answer(title: string): SourceSearch {
  return {
    results: [
      {
        id: "1",
        source: "fake",
        title,
        itemTitle: title,
        searchText: null,
        subtitle: null,
        prices: [{ key: "sold", label: "Sold", cents: 1234 }],
        url: null,
        imageUrl: null,
        identifier: null,
      },
    ],
    summary: [],
    searchUrl: null,
    notice: null,
    quota: { limit: 50, remaining: 46, resetsAt: null },
  };
}

function fakeSource(id: string, search: PriceSource["search"], configured = true): PriceSource & { search: ReturnType<typeof vi.fn<PriceSource["search"]>> } {
  return {
    id,
    label: id.toUpperCase(),
    siteName: id,
    description: "",
    setupHint: `Set the key for ${id}.`,
    isConfigured: () => configured,
    search: vi.fn(search),
  };
}

const NOON = new Date("2026-11-23T12:00:00.000Z");
const hoursLater = (hours: number) => new Date(NOON.getTime() + hours * 60 * 60 * 1000);

describe("lookupInSource", () => {
  it("calls the source once, then serves the cache for 24 hours, whatever the case or spacing", async () => {
    const source = fakeSource("cache-a", async (query) => answer(query));

    const first = await lookupInSource(t.db, t.userId, source, "Mario Kart", NOON);
    expect(first).toMatchObject({ status: "ok", cached: false, fetchedAt: NOON.toISOString() });

    const second = await lookupInSource(t.db, t.userId, source, "  mario   KART ", hoursLater(23.9));
    expect(second).toMatchObject({ status: "ok", cached: true, fetchedAt: NOON.toISOString() });
    expect(second.status === "ok" ? second.data : null).toEqual(answer("Mario Kart"));
    expect(source.search).toHaveBeenCalledTimes(1);

    const third = await lookupInSource(t.db, t.userId, source, "mario kart", hoursLater(24));
    expect(third).toMatchObject({ status: "ok", cached: false, fetchedAt: hoursLater(24).toISOString() });
    expect(source.search).toHaveBeenCalledTimes(2);

    const rows = await t.db
      .selectFrom("price_lookup_cache")
      .select(["normalized_query", "fetched_at"])
      .where("source", "=", "cache-a")
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.normalized_query).toBe("mario kart");
    expect(rows[0]?.fetched_at.toISOString()).toBe(hoursLater(24).toISOString());
  });

  it("keeps each source's cache apart", async () => {
    const one = fakeSource("apart-1", async () => answer("from one"));
    const two = fakeSource("apart-2", async () => answer("from two"));
    await lookupInSource(t.db, t.userId, one, "same query", NOON);
    const outcome = await lookupInSource(t.db, t.userId, two, "same query", NOON);
    expect(outcome).toMatchObject({ status: "ok", cached: false });
    expect(two.search).toHaveBeenCalledTimes(1);
  });

  it("reports a source failure without caching it", async () => {
    let fail = true;
    const source = fakeSource("flaky", async () => {
      if (fail) throw new PriceSourceError("quota", "The allowance is used up (HTTP 429).", 429);
      return answer("ok now");
    });
    const failed = await lookupInSource(t.db, t.userId, source, "thing", NOON);
    expect(failed).toEqual({
      source: "flaky",
      label: "FLAKY",
      status: "error",
      code: "quota",
      message: "The allowance is used up (HTTP 429).",
    });
    fail = false;
    expect(await lookupInSource(t.db, t.userId, source, "thing", NOON)).toMatchObject({ status: "ok", cached: false });
  });

  it("hides the details of an unexpected error", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = fakeSource("broken", async () => {
      throw new TypeError("secret detail");
    });
    const outcome = await lookupInSource(t.db, t.userId, source, "thing", NOON);
    expect(outcome).toMatchObject({ status: "error", code: "unavailable", message: "BROKEN could not be searched just now." });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it("never calls a source that is not configured", async () => {
    const source = fakeSource("unset", async () => answer("x"), false);
    expect(await lookupInSource(t.db, t.userId, source, "thing", NOON)).toEqual({
      source: "unset",
      label: "UNSET",
      status: "not_configured",
      message: "Set the key for unset.",
    });
    expect(source.search).not.toHaveBeenCalled();
  });

  it("shares one call between two identical searches made at the same moment", async () => {
    const source = fakeSource("dedupe", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return answer("once");
    });
    const [a, b] = await Promise.all([
      lookupInSource(t.db, t.userId, source, "Same Thing", NOON),
      lookupInSource(t.db, t.userId, source, "same thing", NOON),
    ]);
    expect(source.search).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ status: "ok" });
    expect(b).toEqual(a);
  });

  it("ignores a cached payload that no longer matches the result shape", async () => {
    await t.db
      .insertInto("price_lookup_cache")
      .values({ user_id: t.userId, source: "stale-shape", normalized_query: "thing", payload: JSON.stringify({ old: true }), fetched_at: NOON })
      .execute();
    const source = fakeSource("stale-shape", async () => answer("fresh"));
    expect(await lookupInSource(t.db, t.userId, source, "thing", NOON)).toMatchObject({ status: "ok", cached: false });
    expect(source.search).toHaveBeenCalledTimes(1);
  });
});

describe("lookupPrices", () => {
  it("returns every source's own status, so one failing does not blank the other", async () => {
    const good = fakeSource("good", async () => answer("fine"));
    const bad = fakeSource("bad", async () => {
      throw new PriceSourceError("unavailable", "It did not answer.");
    });
    const outcomes = await lookupPrices(t.db, t.userId, [bad, good], "both", { now: NOON });
    expect(outcomes.map((outcome) => [outcome.source, outcome.status])).toEqual([
      ["bad", "error"],
      ["good", "ok"],
    ]);
  });

  it("searches only the sources asked for", async () => {
    const one = fakeSource("only-1", async () => answer("1"));
    const two = fakeSource("only-2", async () => answer("2"));
    const outcomes = await lookupPrices(t.db, t.userId, [one, two], "pick", { only: ["only-2"], now: NOON });
    expect(outcomes.map((outcome) => outcome.source)).toEqual(["only-2"]);
    expect(one.search).not.toHaveBeenCalled();
  });
});
