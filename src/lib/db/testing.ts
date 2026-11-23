import { randomUUID } from "node:crypto";
import { Kysely, sql } from "kysely";
import { createRemoteDb } from "./index";
import { MEMORY_DATA_DIR, openLocalDatabase } from "./local";
import { PGliteDialect } from "./pglite-dialect";
import { migrateToLatest } from "./migrate";
import { seedBase } from "./seed";
import type { DB } from "./types";

export interface TestDb {
  db: Kysely<DB>;
  /** The id of a seeded user with the starter categories and marketplaces. */
  userId: string;
  /** Call this in `afterAll` or `afterEach`. */
  close: () => Promise<void>;
}

/**
 * Creates a fresh in-memory database with the real migrations and the base seed applied.
 * Each call is isolated, so tests can run in parallel. It takes about a second, so prefer one per test file.
 * For vitest only. Do not import it from app code.
 *
 * If TEST_DATABASE_URL is set, the tests run on that Postgres server instead, to check the production driver.
 * Each call creates its own database there and drops it on close, so test files stay isolated.
 * The role in the URL needs permission to create databases.
 */
export async function createTestDb(email = "test@second-story.test"): Promise<TestDb> {
  const remoteUrl = process.env.TEST_DATABASE_URL?.trim();
  if (remoteUrl) return createRemoteTestDb(remoteUrl, email);
  const client = await openLocalDatabase(MEMORY_DATA_DIR);
  const db = new Kysely<DB>({ dialect: new PGliteDialect(async () => client) });
  const userId = await seedBase(db, email);
  return {
    db,
    userId,
    close: async () => {
      await db.destroy();
      await client.close();
    },
  };
}

async function createRemoteTestDb(adminUrl: string, email: string): Promise<TestDb> {
  // Database names cannot be bound as parameters. This one is built from a UUID only, so it is safe to inline.
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = createRemoteDb(adminUrl);
  await sql.raw(`create database ${name}`).execute(admin);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = createRemoteDb(url.toString());
  await migrateToLatest(db);
  const userId = await seedBase(db, email);
  return {
    db,
    userId,
    close: async () => {
      await db.destroy();
      await sql.raw(`drop database if exists ${name} with (force)`).execute(admin);
      await admin.destroy();
    },
  };
}
