import type { PGlite } from "@electric-sql/pglite";
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
  type TransactionSettings,
} from "kysely";

const ROW_COUNT_COMMANDS = new Set(["INSERT", "UPDATE", "DELETE", "MERGE"]);

/**
 * Kysely dialect for PGlite, the in-process Postgres used for local dev and tests.
 *
 * PGlite has a single connection. If two requests ran at once, one request's
 * queries could land inside the other's transaction. The driver hands the
 * connection to one caller at a time, so a transaction holds it until it ends.
 */
export class PGliteDialect implements Dialect {
  readonly #open: () => Promise<PGlite>;

  constructor(open: () => Promise<PGlite>) {
    this.#open = open;
  }

  createAdapter() {
    return new PostgresAdapter();
  }

  createDriver(): Driver {
    return new PGliteDriver(this.#open);
  }

  createIntrospector(db: Kysely<unknown>) {
    return new PostgresIntrospector(db);
  }

  createQueryCompiler() {
    return new PostgresQueryCompiler();
  }
}

class PGliteDriver implements Driver {
  readonly #open: () => Promise<PGlite>;
  #client: PGlite | undefined;
  #tail: Promise<void> = Promise.resolve();

  constructor(open: () => Promise<PGlite>) {
    this.#open = open;
  }

  async init(): Promise<void> {
    this.#client = await this.#open();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const client = this.#client;
    if (!client) throw new Error("PGlite driver is not initialized");
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return new PGliteConnection(client, release);
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    let sql = "begin";
    if (settings.isolationLevel) sql += ` isolation level ${settings.isolationLevel}`;
    if (settings.accessMode) sql += ` ${settings.accessMode}`;
    await connection.executeQuery(CompiledQuery.raw(sql));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    if (connection instanceof PGliteConnection) connection.release();
  }

  // The PGlite instance is shared (dev singleton, test helper) and is closed by its owner.
  async destroy(): Promise<void> {
    this.#client = undefined;
  }
}

class PGliteConnection implements DatabaseConnection {
  readonly #client: PGlite;
  readonly release: () => void;

  constructor(client: PGlite, release: () => void) {
    this.#client = client;
    this.release = release;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.#client.query<R>(compiledQuery.sql, [
      ...compiledQuery.parameters,
    ]);
    const command = result.command?.toUpperCase();
    if (command !== undefined && ROW_COUNT_COMMANDS.has(command)) {
      return {
        rows: result.rows,
        numAffectedRows: BigInt(result.affectedRows ?? 0),
      };
    }
    return { rows: result.rows };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming is not supported by the PGlite dialect");
  }
}
