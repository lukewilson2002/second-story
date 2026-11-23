import { Kysely, PostgresDialect, type Dialect, type PostgresPool, type Transaction } from "kysely";
import { MEMORY_DATA_DIR, localDataDir, openLocalDatabase } from "./local";
import { PGliteDialect } from "./pglite-dialect";
import type { DB } from "./types";

export type { DB } from "./types";

/** The app database handle. */
export type Db = Kysely<DB>;
/** A handle that works both inside and outside a transaction. Helpers that only run queries take this. */
export type DbOrTrx = Kysely<DB> | Transaction<DB>;

const DATE_OID = 1082;
const INT8_OID = 20;

/** True when DATABASE_URL is set, so the app talks to a real Postgres server instead of the local PGlite database. */
export function usesRemoteDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

/**
 * Builds the dialect for DATABASE_URL.
 * Neon hosts use Neon's serverless Pool, which speaks WebSocket and supports interactive transactions.
 * Any other Postgres URL uses the plain `pg` Pool.
 * Both get the same type parsers as PGlite: `date` is a "YYYY-MM-DD" string and `bigint` is a number.
 */
function remoteDialect(url: string): Dialect {
  return new PostgresDialect({
    pool: async () => {
      if (isNeonUrl(url)) {
        const { Pool, types } = await import("@neondatabase/serverless");
        types.setTypeParser(DATE_OID, (value: string) => value);
        types.setTypeParser(INT8_OID, (value: string) => Number(value));
        // Neon's Pool is the `pg` Pool with a WebSocket transport. Its typings differ only in what Client.connect() resolves to.
        return new Pool({ connectionString: url, max: 5 }) as unknown as PostgresPool;
      }
      const pg = await import("pg");
      pg.types.setTypeParser(DATE_OID, (value: string) => value);
      pg.types.setTypeParser(INT8_OID, (value: string) => Number(value));
      return new pg.Pool({ connectionString: url, max: 5 });
    },
  });
}

function createDb(): Db {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return new Kysely<DB>({ dialect: remoteDialect(url) });
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. The local PGlite database is for dev and tests only.");
  }
  const dataDir = localDataDir();
  return new Kysely<DB>({ dialect: new PGliteDialect(() => openLocalDatabase(dataDir)) });
}

const globalStore = globalThis as typeof globalThis & { __secondStoryDb?: Db };

/**
 * Returns the one database handle for this process.
 * It is kept on globalThis because Next.js dev reloads modules, and a second PGlite instance on the same directory would corrupt it.
 * Nothing connects until the first query runs, so importing this module is safe at build time.
 * On the local database the first query also runs pending migrations.
 *
 * Inside `db.transaction().execute(async (trx) => ...)` use only `trx`.
 * The local database has a single connection, so a query on `db` inside the callback waits forever.
 */
export function getDb(): Db {
  globalStore.__secondStoryDb ??= createDb();
  return globalStore.__secondStoryDb;
}

export { MEMORY_DATA_DIR };
