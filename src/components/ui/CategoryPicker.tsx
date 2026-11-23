"use client";

import { useMemo } from "react";
import { buildCategoryTree, categoryPath, flattenCategoryTree, type CategoryRecord } from "@/lib/domain/categories";
import { Select, type SelectProps } from "./Input";

export interface CategoryPickerProps extends Omit<SelectProps, "children" | "value" | "defaultValue" | "onChange"> {
  /** Every category the user has, archived ones included. Load them with `loadCategories`. */
  categories: readonly CategoryRecord[];
  /** Controlled value. Use "" for nothing picked. */
  value?: string;
  /** Uncontrolled starting value. */
  defaultValue?: string;
  onValueChange?: (categoryId: string) => void;
  /**
   * The label of an extra first option with an empty value, for example "All categories" on a filter or "Choose a category" on a form.
   * Leave it out to offer only real categories.
   */
  emptyLabel?: string;
}

/**
 * Picks one category from the tree. Children are indented under their parent.
 * Archived categories are left out, along with everything under them.
 * If the current value is an archived category, it stays in the list marked "(archived)", so editing an old item does not lose its category.
 */
export function CategoryPicker({ categories, value, defaultValue, onValueChange, emptyLabel, ...props }: CategoryPickerProps) {
  const options = useMemo(
    () => flattenCategoryTree(buildCategoryTree(categories, { includeArchived: false })),
    [categories],
  );
  const current = value ?? defaultValue ?? "";
  const currentIsMissing = current !== "" && !options.some((option) => option.id === current);
  const archivedLabel = currentIsMissing
    ? categoryPath(current, new Map(categories.map((category) => [category.id, category])))
    : "";

  return (
    <Select
      {...props}
      {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? "" })}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {currentIsMissing && archivedLabel ? <option value={current}>{archivedLabel} (archived)</option> : null}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {/* Non-breaking spaces, because browsers collapse normal spaces inside <option>. */}
          {"   ".repeat(option.depth)}
          {option.name}
        </option>
      ))}
    </Select>
  );
}
