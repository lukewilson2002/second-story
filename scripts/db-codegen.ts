import path from "node:path";
import { Kysely } from "kysely";
import { generate, PostgresDialect } from "kysely-codegen";
import { MEMORY_DATA_DIR, openLocalDatabase } from "../src/lib/db/local";
import { PGliteDialect } from "../src/lib/db/pglite-dialect";

/**
 * Regenerates src/lib/db/types.ts from the migrations.
 * It introspects a throwaway in-memory database, so it never touches dev data or DATABASE_URL.
 */
async function main(): Promise<void> {
  const client = await openLocalDatabase(MEMORY_DATA_DIR);
  const db = new Kysely<unknown>({ dialect: new PGliteDialect(async () => client) });
  const outFile = path.resolve(process.cwd(), "src/lib/db/types.ts");
  await generate({
    db,
    dialect: new PostgresDialect({ dateParser: "string" }),
    outFile,
    excludePattern: "kysely_*",
  });
  await db.destroy();
  await client.close();
  console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
