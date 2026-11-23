import type { Migration } from "kysely/migration";
import * as m0001 from "./0001_init";

/**
 * Every migration, keyed by name. Kysely runs them in alphabetical key order.
 * They are imported statically because Next.js bundles server code, so reading a migrations folder at runtime would fail.
 * Feature agents do not add migrations. The schema is fixed by the foundation.
 */
export const migrations: Record<string, Migration> = {
  "0001_init": m0001,
};
