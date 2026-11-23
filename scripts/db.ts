import { loadEnv } from "./load-env";

// Read before loadEnv(), which fills in OWNER_EMAIL from .env.development when the shell did not set it.
const ownerEmailFromShell = process.env.OWNER_EMAIL?.trim().toLowerCase();

loadEnv();

const COMMANDS = ["migrate", "seed", "seed:demo", "reset"] as const;
type Command = (typeof COMMANDS)[number];

/**
 * The email the owner row is seeded under.
 * If DATABASE_URL is set, OWNER_EMAIL must be given on the command line.
 * Otherwise the dev login from .env.development would be seeded into the real database as a second user.
 */
function ownerEmail(): string {
  if (process.env.DATABASE_URL?.trim()) {
    if (!ownerEmailFromShell) {
      throw new Error(
        "Set OWNER_EMAIL on the command line when DATABASE_URL is set, to the same address as in Vercel. " +
          "For example: DATABASE_URL='postgresql://...' OWNER_EMAIL='you@example.com' pnpm db:seed",
      );
    }
    return ownerEmailFromShell;
  }
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("OWNER_EMAIL is not set. See .env.example.");
  return email;
}

/** `reset` and `seed:demo` change or delete data wholesale, so they only ever run on the local database. */
function assertLocalOnly(command: Command): void {
  if (process.env.DATABASE_URL?.trim()) {
    throw new Error(`"db:${command}" only runs on the local database. Unset DATABASE_URL to use it.`);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  if (!command || !COMMANDS.includes(command)) {
    throw new Error(`Usage: tsx scripts/db.ts <${COMMANDS.join("|")}>`);
  }

  // Imported after loadEnv() so the modules see the loaded variables.
  const { getDb, usesRemoteDatabase } = await import("../src/lib/db");
  const { localDataDir, removeLocalDatabase } = await import("../src/lib/db/local");
  const where = usesRemoteDatabase() ? "DATABASE_URL" : `local database at ${localDataDir()}`;

  if (command === "reset") {
    assertLocalOnly(command);
    removeLocalDatabase(localDataDir());
    console.log(`Deleted the ${where}.`);
  }
  if (command === "seed:demo") assertLocalOnly(command);
  // Worked out before anything connects, so a missing OWNER_EMAIL stops the command before it touches the database.
  const seedEmail = command === "migrate" ? null : ownerEmail();

  const db = getDb();
  try {
    const { migrateToLatest } = await import("../src/lib/db/migrate");
    const ran = await migrateToLatest(db);
    console.log(ran.length > 0 ? `Migrated ${where}: ${ran.join(", ")}` : `Schema is up to date on ${where}.`);

    if (command === "seed" || command === "reset") {
      const { seedBase } = await import("../src/lib/db/seed");
      await seedBase(db, seedEmail ?? ownerEmail());
      console.log("Seeded the owner, categories and marketplaces.");
    }
    if (command === "seed:demo") {
      const { seedDemo } = await import("../src/lib/db/demo-seed");
      const summary = await seedDemo(db, seedEmail ?? ownerEmail());
      console.log(`Seeded demo data: ${summary.items} items, ${summary.listings} listings, ${summary.sales} sales.`);
    }
  } finally {
    await db.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
