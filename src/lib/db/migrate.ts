import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "./migrations";

/** Runs every pending migration. Throws if any migration fails. Returns the names that ran. */
export async function migrateToLatest<T>(db: Kysely<T>): Promise<string[]> {
  const migrator = new Migrator({
    db: db as unknown as Kysely<unknown>,
    provider: { getMigrations: async () => migrations },
  });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === "Error");
  if (failed) throw new Error(`Migration ${failed.migrationName} failed`, { cause: error });
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return (results ?? []).filter((r) => r.status === "Success").map((r) => r.migrationName);
}
