import { categoryAncestorIds, categoryWithDescendantIds, type CategoryRecord } from "@/lib/domain/categories";

/** Pure rules for editing the category tree. Safe to import from Client Components. */

type TreeRow = Pick<CategoryRecord, "id" | "parentId">;

export type MoveProblem = "not_found" | "parent_not_found" | "own_parent" | "under_descendant";

export const MOVE_PROBLEM_MESSAGES: Record<MoveProblem, string> = {
  not_found: "That category no longer exists.",
  parent_not_found: "The parent category no longer exists.",
  own_parent: "A category cannot be its own parent.",
  under_descendant: "A category cannot move under one of its own subcategories.",
};

/**
 * Says why a category cannot move under `newParentId`, or returns null if the move is fine.
 * A null `newParentId` moves the category to the top level, which is always allowed.
 * If the new parent sits anywhere below the category, the move would close a loop, so it is refused.
 */
export function moveProblem(
  categories: readonly TreeRow[],
  categoryId: string,
  newParentId: string | null,
): MoveProblem | null {
  const byId = new Map(categories.map((category) => [category.id, category]));
  if (!byId.has(categoryId)) return "not_found";
  if (newParentId === null) return null;
  if (!byId.has(newParentId)) return "parent_not_found";
  if (newParentId === categoryId) return "own_parent";
  if (categoryAncestorIds(newParentId, byId).includes(categoryId)) return "under_descendant";
  return null;
}

/**
 * The categories a category may move under: everything except itself and its descendants.
 * The descendants must go too. If only the category were dropped, a tree built from the rest would show its children at the top level.
 */
export function moveTargets<T extends TreeRow>(categories: readonly T[], categoryId: string): T[] {
  const excluded = new Set(categoryWithDescendantIds(categoryId, categories));
  return categories.filter((category) => !excluded.has(category.id));
}

/** Names are compared the way the database's unique index does: case-insensitively. Surrounding spaces are ignored. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Finds the category that already uses `name` under `parentId`, or null.
 * Archived categories count, because they still hold their name.
 * Pass `exceptId` when renaming or moving, so a category does not clash with itself.
 */
export function findSiblingWithName<T extends Pick<CategoryRecord, "id" | "parentId" | "name">>(
  categories: readonly T[],
  parentId: string | null,
  name: string,
  exceptId?: string,
): T | null {
  return (
    categories.find(
      (category) => category.parentId === parentId && category.id !== exceptId && sameName(category.name, name),
    ) ?? null
  );
}

/**
 * True if the category or any ancestor is archived.
 * Pickers leave out everything under an archived category, so such a category is hidden even when it is not archived itself.
 */
export function isHiddenFromPickers(
  categoryId: string,
  byId: ReadonlyMap<string, Pick<CategoryRecord, "id" | "parentId" | "archived">>,
): boolean {
  return categoryAncestorIds(categoryId, byId).some((id) => byId.get(id)?.archived === true);
}
