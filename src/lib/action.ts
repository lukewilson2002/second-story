import type { z } from "zod";

/**
 * The value every Server Action returns (unless it redirects).
 * `fieldErrors` is keyed by form field name, so a form can show each message under its field.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

/** A failure with a message for the person using the app. Do not put error stacks or SQL in it. */
export function actionError(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/** Turns a Zod error into an ActionResult. Nested paths become dotted keys such as "identifiers.0.value". */
export function validationError(error: z.ZodError, message = "Check the highlighted fields."): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: message, fieldErrors };
}

/**
 * Reads a FormData into a plain object for Zod.
 * Each key gets its string value. A key that appears more than once gets an array. Files are skipped.
 */
export function formDataToObject(formData: FormData): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    // Next.js adds its own "$ACTION_..." fields to a form that posts to a Server Action.
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key).filter((value): value is string => typeof value === "string");
    const first = values[0];
    if (first === undefined) continue;
    result[key] = values.length > 1 ? values : first;
  }
  return result;
}
