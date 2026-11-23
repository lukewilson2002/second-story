type ClassValue = string | false | null | undefined;

/** Joins class names, skipping false, null and undefined. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
