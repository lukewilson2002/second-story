import type { Transaction } from "kysely";
import type { DB, DbOrTrx } from "@/lib/db";
import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";
import type { CategoryRecord } from "@/lib/domain/categories";
import type {
  CommissionInput,
  CreateCategoryInput,
  CreateMarketplaceInput,
  RenameMarketplaceInput,
  SaveFeeRuleInput,
  SetArchivedInput,
  UpdateCategoryInput,
} from "./schemas";
import { MOVE_PROBLEM_MESSAGES, findSiblingWithName, moveProblem, sameName } from "./tree";

/**
 * Queries and writes for Settings. Every function takes the database and the user id, so tests can pass an in-memory database.
 * Broken rules throw `SettingsError`, whose message is written for the person using the app.
 */

/** A DomainError that can point at the form field it is about. */
export class SettingsError extends DomainError {
  readonly field: string | undefined;

  constructor(code: DomainErrorCode, message: string, field?: string) {
    super(code, message);
    this.name = "SettingsError";
    this.field = field;
  }
}

export interface MarketplaceRecord {
  id: string;
  name: string;
  archived: boolean;
}

export interface CommissionDefaults {
  defaultCommissionBps: number | null;
  defaultCommissionPayee: string | null;
}

/** Runs the callback in a transaction. If `db` is already a transaction, it is used as is, because Kysely cannot nest them. */
function inTransaction<T>(db: DbOrTrx, run: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
  return db.isTransaction ? run(db as Transaction<DB>) : db.transaction().execute(run);
}

/**
 * Loads the user's categories and locks the rows until the transaction ends.
 * The lock stops two moves at once from each passing the cycle check and together closing a loop.
 */
async function loadCategoriesForUpdate(trx: Transaction<DB>, userId: string): Promise<CategoryRecord[]> {
  const rows = await trx
    .selectFrom("category")
    .select(["id", "parent_id", "name", "archived_at"])
    .where("user_id", "=", userId)
    .forUpdate()
    .execute();
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    archived: row.archived_at !== null,
  }));
}

function nameTakenError(existing: CategoryRecord, parentName: string | null): SettingsError {
  const where = parentName === null ? "at the top level" : `under ${parentName}`;
  return new SettingsError(
    "invalid",
    existing.archived
      ? `An archived category called "${existing.name}" already exists ${where}. Unarchive it, or pick another name.`
      : `A category called "${existing.name}" already exists ${where}.`,
    "name",
  );
}

/**
 * Checks that a category may sit under `parentId` with `name`.
 * If the parent is missing or archived, or a sibling (archived ones included) already has the name, it throws.
 */
function assertCategoryPlacement(
  categories: readonly CategoryRecord[],
  parentId: string | null,
  name: string,
  options: { exceptId?: string; parentChanged: boolean },
): void {
  const parent = parentId === null ? null : (categories.find((category) => category.id === parentId) ?? null);
  if (parentId !== null && parent === null) {
    throw new SettingsError("not_found", MOVE_PROBLEM_MESSAGES.parent_not_found, "parentId");
  }
  if (parent?.archived && options.parentChanged) {
    throw new SettingsError("invalid", `"${parent.name}" is archived. Unarchive it first, or pick another parent.`, "parentId");
  }
  const clash = findSiblingWithName(categories, parentId, name, options.exceptId);
  if (clash) throw nameTakenError(clash, parent?.name ?? null);
}

/** Adds a category under `parentId`, or at the top level if it is null. Returns the new id. */
export async function createCategory(db: DbOrTrx, userId: string, input: CreateCategoryInput): Promise<string> {
  return inTransaction(db, async (trx) => {
    const categories = await loadCategoriesForUpdate(trx, userId);
    assertCategoryPlacement(categories, input.parentId, input.name, { parentChanged: true });
    const created = await trx
      .insertInto("category")
      .values({ user_id: userId, parent_id: input.parentId, name: input.name })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  });
}

/**
 * Renames a category, moves it to another parent, or both.
 * If the new parent is the category itself or anything below it, the move is refused, because it would close a loop.
 * The name must be free among the siblings it ends up with.
 */
export async function updateCategory(db: DbOrTrx, userId: string, input: UpdateCategoryInput): Promise<void> {
  await inTransaction(db, async (trx) => {
    const categories = await loadCategoriesForUpdate(trx, userId);
    const current = categories.find((category) => category.id === input.id);
    if (!current) throw new SettingsError("not_found", MOVE_PROBLEM_MESSAGES.not_found);
    const problem = moveProblem(categories, input.id, input.parentId);
    if (problem) {
      throw new SettingsError(problem.endsWith("not_found") ? "not_found" : "invalid", MOVE_PROBLEM_MESSAGES[problem], "parentId");
    }
    assertCategoryPlacement(categories, input.parentId, input.name, {
      exceptId: input.id,
      parentChanged: current.parentId !== input.parentId,
    });
    await trx
      .updateTable("category")
      .set({ name: input.name, parent_id: input.parentId })
      .where("id", "=", input.id)
      .where("user_id", "=", userId)
      .execute();
  });
}

/**
 * Archives or unarchives a category.
 * Only this row changes. Subcategories keep their own state, and pickers already hide everything under an archived category.
 * Items keep an archived category.
 */
export async function setCategoryArchived(db: DbOrTrx, userId: string, input: SetArchivedInput): Promise<void> {
  const result = await db
    .updateTable("category")
    .set({ archived_at: input.archived ? new Date() : null })
    .where("id", "=", input.id)
    .where("user_id", "=", userId)
    // Archiving twice keeps the first archive time.
    .where("archived_at", input.archived ? "is" : "is not", null)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) await assertExists(db, "category", userId, input.id, MOVE_PROBLEM_MESSAGES.not_found);
}

/** How many inventory items sit directly in each category. Categories with none are not in the map. */
export async function loadCategoryItemCounts(db: DbOrTrx, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom("inventory_item")
    .select((eb) => ["category_id", eb.fn.countAll<number>().as("count")])
    .where("user_id", "=", userId)
    .groupBy("category_id")
    .execute();
  return new Map(rows.map((row) => [row.category_id, Number(row.count)]));
}

/** Loads every marketplace for a user, archived ones included, ordered by name. */
export async function loadMarketplaces(db: DbOrTrx, userId: string): Promise<MarketplaceRecord[]> {
  const rows = await db
    .selectFrom("marketplace")
    .select(["id", "name", "archived_at"])
    .where("user_id", "=", userId)
    .orderBy((eb) => eb.fn("lower", ["name"]))
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, archived: row.archived_at !== null }));
}

/** Throws if another marketplace, archived ones included, already uses the name. */
async function assertMarketplaceNameFree(trx: Transaction<DB>, userId: string, name: string, exceptId?: string): Promise<void> {
  const marketplaces = await loadMarketplaces(trx, userId);
  const clash = marketplaces.find((marketplace) => marketplace.id !== exceptId && sameName(marketplace.name, name));
  if (!clash) return;
  throw new SettingsError(
    "invalid",
    clash.archived
      ? `An archived marketplace called "${clash.name}" already exists. Unarchive it, or pick another name.`
      : `A marketplace called "${clash.name}" already exists.`,
    "name",
  );
}

/** Adds a marketplace. Returns the new id. */
export async function createMarketplace(db: DbOrTrx, userId: string, input: CreateMarketplaceInput): Promise<string> {
  return inTransaction(db, async (trx) => {
    await assertMarketplaceNameFree(trx, userId, input.name);
    const created = await trx
      .insertInto("marketplace")
      .values({ user_id: userId, name: input.name })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  });
}

export async function renameMarketplace(db: DbOrTrx, userId: string, input: RenameMarketplaceInput): Promise<void> {
  await inTransaction(db, async (trx) => {
    await assertMarketplaceNameFree(trx, userId, input.name, input.id);
    const result = await trx
      .updateTable("marketplace")
      .set({ name: input.name })
      .where("id", "=", input.id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new SettingsError("not_found", "That marketplace no longer exists.");
  });
}

/**
 * Archives or unarchives a marketplace.
 * An archived marketplace keeps its fee rules, listings and sales. It only leaves the pickers.
 */
export async function setMarketplaceArchived(db: DbOrTrx, userId: string, input: SetArchivedInput): Promise<void> {
  const result = await db
    .updateTable("marketplace")
    .set({ archived_at: input.archived ? new Date() : null })
    .where("id", "=", input.id)
    .where("user_id", "=", userId)
    .where("archived_at", input.archived ? "is" : "is not", null)
    .executeTakeFirst();
  if (result.numUpdatedRows === 0n) {
    await assertExists(db, "marketplace", userId, input.id, "That marketplace no longer exists.");
  }
}

async function assertExists(
  db: DbOrTrx,
  table: "category" | "marketplace",
  userId: string,
  id: string,
  message: string,
): Promise<void> {
  const row = await db.selectFrom(table).select("id").where("id", "=", id).where("user_id", "=", userId).executeTakeFirst();
  if (!row) throw new SettingsError("not_found", message);
}

/**
 * Creates a fee rule, or updates the one with `input.id`.
 * A marketplace has at most one rule per category and one default (no category).
 * If another rule already covers the same marketplace and category, it throws and points at the category field.
 * A rule cannot move to another marketplace.
 * Returns the rule id.
 */
export async function saveFeeRule(db: DbOrTrx, userId: string, input: SaveFeeRuleInput): Promise<string> {
  return inTransaction(db, async (trx) => {
    await assertExists(trx, "marketplace", userId, input.marketplaceId, "That marketplace no longer exists.");
    let categoryName: string | null = null;
    if (input.categoryId !== null) {
      const category = await trx
        .selectFrom("category")
        .select("name")
        .where("id", "=", input.categoryId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!category) throw new SettingsError("not_found", "That category no longer exists.", "categoryId");
      categoryName = category.name;
    }

    const clash = await trx
      .selectFrom("fee_rule")
      .select("id")
      .where("user_id", "=", userId)
      .where("marketplace_id", "=", input.marketplaceId)
      .where("category_id", input.categoryId === null ? "is" : "=", input.categoryId)
      .executeTakeFirst();
    if (clash && clash.id !== input.id) {
      throw new SettingsError(
        "invalid",
        categoryName === null
          ? "This marketplace already has a default rule. Edit that rule instead."
          : `This marketplace already has a rule for ${categoryName}. Edit that rule instead.`,
        "categoryId",
      );
    }

    const terms = {
      category_id: input.categoryId,
      percent_bps: input.percentBps,
      applies_to_shipping: input.appliesToShipping,
      fixed_cents: input.fixedCents,
      payment_percent_bps: input.paymentPercentBps,
      payment_fixed_cents: input.paymentFixedCents,
    };

    if (input.id === null) {
      const created = await trx
        .insertInto("fee_rule")
        .values({ user_id: userId, marketplace_id: input.marketplaceId, ...terms })
        .returning("id")
        .executeTakeFirstOrThrow();
      return created.id;
    }

    const result = await trx
      .updateTable("fee_rule")
      .set(terms)
      .where("id", "=", input.id)
      .where("user_id", "=", userId)
      .where("marketplace_id", "=", input.marketplaceId)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new SettingsError("not_found", "That fee rule no longer exists.");
    return input.id;
  });
}

/** Deletes a fee rule. Past sales keep the fee they were recorded with. Deleting a rule that is already gone is not an error. */
export async function deleteFeeRule(db: DbOrTrx, userId: string, id: string): Promise<void> {
  await db.deleteFrom("fee_rule").where("id", "=", id).where("user_id", "=", userId).execute();
}

/** The default commission that new listings start with. Both values are null until the owner sets them. */
export async function loadCommissionDefaults(db: DbOrTrx, userId: string): Promise<CommissionDefaults> {
  const row = await db
    .selectFrom("user_settings")
    .select(["default_commission_bps", "default_commission_payee"])
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return {
    defaultCommissionBps: row?.default_commission_bps ?? null,
    defaultCommissionPayee: row?.default_commission_payee ?? null,
  };
}

/** Saves the default commission. Existing listings keep the commission they were created with. */
export async function saveCommissionDefaults(db: DbOrTrx, userId: string, input: CommissionInput): Promise<void> {
  const values = {
    default_commission_bps: input.defaultCommissionBps,
    default_commission_payee: input.defaultCommissionPayee,
    updated_at: new Date(),
  };
  await db
    .insertInto("user_settings")
    .values({ user_id: userId, ...values })
    .onConflict((oc) => oc.column("user_id").doUpdateSet(values))
    .execute();
}

/** The email the owner signs in with, or null if the user row is gone. */
export async function loadOwnerEmail(db: DbOrTrx, userId: string): Promise<string | null> {
  const row = await db.selectFrom("app_user").select("email").where("id", "=", userId).executeTakeFirst();
  return row?.email ?? null;
}
