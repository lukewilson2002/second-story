import type { DbOrTrx } from "@/lib/db";

/** A category row as the app passes it around. Safe to send to Client Components. */
export interface CategoryRecord {
  id: string;
  parentId: string | null;
  name: string;
  archived: boolean;
}

export interface CategoryNode extends CategoryRecord {
  /** Number of ancestors. Top-level categories are 0. */
  depth: number;
  /** Names from the top level down to this category, for example ["Movie", "DVD"]. */
  path: string[];
  children: CategoryNode[];
}

export const CATEGORY_PATH_SEPARATOR = " › ";

/** Loads every category for a user, archived ones included, ordered by name. */
export async function loadCategories(db: DbOrTrx, userId: string): Promise<CategoryRecord[]> {
  const rows = await db
    .selectFrom("category")
    .select(["id", "parent_id", "name", "archived_at"])
    .where("user_id", "=", userId)
    .orderBy("name")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    archived: row.archived_at !== null,
  }));
}

export function categoriesById(categories: readonly CategoryRecord[]): Map<string, CategoryRecord> {
  return new Map(categories.map((category) => [category.id, category]));
}

/**
 * Builds the category tree, with siblings sorted by name.
 * If `includeArchived` is false, archived categories and everything under them are left out. Pickers use that.
 * A category whose parent is missing is treated as top level.
 */
export function buildCategoryTree(
  categories: readonly CategoryRecord[],
  options: { includeArchived?: boolean } = {},
): CategoryNode[] {
  const includeArchived = options.includeArchived ?? true;
  const ids = new Set(categories.map((category) => category.id));
  const childrenOf = new Map<string | null, CategoryRecord[]>();
  for (const category of categories) {
    if (!includeArchived && category.archived) continue;
    const parent = category.parentId !== null && ids.has(category.parentId) ? category.parentId : null;
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(category);
    childrenOf.set(parent, siblings);
  }
  const build = (parentId: string | null, parentPath: string[], seen: Set<string>): CategoryNode[] =>
    (childrenOf.get(parentId) ?? [])
      .filter((category) => !seen.has(category.id))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map((category) => {
        const path = [...parentPath, category.name];
        return {
          ...category,
          depth: parentPath.length,
          path,
          children: build(category.id, path, new Set([...seen, category.id])),
        };
      });
  return build(null, [], new Set());
}

/** Flattens a tree depth-first, parents before children. Handy for <select> options. */
export function flattenCategoryTree(tree: readonly CategoryNode[]): CategoryNode[] {
  return tree.flatMap((node) => [node, ...flattenCategoryTree(node.children)]);
}

/**
 * The ids from a category up to its top-level ancestor, starting with the category itself.
 * Stops if the chain loops or a parent is missing.
 */
export function categoryAncestorIds(
  categoryId: string,
  byId: ReadonlyMap<string, Pick<CategoryRecord, "id" | "parentId">>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = categoryId;
  while (current !== null && !seen.has(current)) {
    const category = byId.get(current);
    if (!category) break;
    chain.push(category.id);
    seen.add(category.id);
    current = category.parentId;
  }
  return chain;
}

/** The full name of a category, for example "Movie › DVD". Returns "" if the id is unknown. */
export function categoryPath(categoryId: string, byId: ReadonlyMap<string, CategoryRecord>): string {
  return categoryAncestorIds(categoryId, byId)
    .reverse()
    .map((id) => byId.get(id)?.name ?? "")
    .join(CATEGORY_PATH_SEPARATOR);
}

/** The id of the top-level ancestor of a category, or the category itself if it is top level. */
export function topLevelCategoryId(
  categoryId: string,
  byId: ReadonlyMap<string, Pick<CategoryRecord, "id" | "parentId">>,
): string {
  return categoryAncestorIds(categoryId, byId).at(-1) ?? categoryId;
}

/** A category id and all of its descendants. Use it to filter inventory by a parent category. */
export function categoryWithDescendantIds(
  categoryId: string,
  categories: readonly Pick<CategoryRecord, "id" | "parentId">[],
): string[] {
  const result = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId !== null && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id);
        grew = true;
      }
    }
  }
  return [...result];
}

/**
 * A short code for the thumbnail square shown when an item has no photo.
 * Names of up to three characters are used whole ("DVD", "VHS", "N64").
 * Several words give their initials ("Blu-ray" gives "BR"). One longer word gives its first letter and next consonant ("Book" gives "BK").
 */
export function categoryCode(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  if (words.length > 1) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  if (first.length <= 3) return first.toUpperCase();
  const consonant = /[^aeiou\d]/i.exec(first.slice(1))?.[0] ?? first[1] ?? "";
  return `${first[0]}${consonant}`.toUpperCase();
}
