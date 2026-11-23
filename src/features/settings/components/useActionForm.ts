"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action";

type SettingsAction = (previous: ActionResult<undefined> | null, formData: FormData) => Promise<ActionResult<undefined>>;

export interface ActionForm {
  /** Put this on the <form>. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Runs the action with values built in code, for a button that is not in a form. */
  submit: (values: Record<string, string>) => void;
  pending: boolean;
  /** The message to show in a FormError. It is null if a field already shows the same message. */
  formError: string | null;
  fieldErrors: Record<string, string[]>;
  /** True after the last submit succeeded, until the next submit starts. */
  saved: boolean;
}

/**
 * Runs a settings Server Action from a form and keeps its result.
 *
 * It submits from `onSubmit` instead of the form's `action` prop.
 * React clears a form's fields after a form action finishes, even if the action returned an error.
 * Submitting by hand keeps what the person typed, so they can fix it.
 * If the action succeeds, `onSuccess` is called, usually to close a dialog.
 */
export function useActionForm(action: SettingsAction, onSuccess?: () => void): ActionForm {
  const [result, setResult] = useState<ActionResult<undefined> | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (formData: FormData) => {
    startTransition(async () => {
      setResult(null);
      const next = await action(null, formData);
      setResult(next);
      if (next.ok) onSuccess?.();
    });
  };

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const error = result && !result.ok ? result.error : null;
  const shownOnField = error !== null && Object.values(fieldErrors).some((messages) => messages.includes(error));

  return {
    onSubmit: (event) => {
      event.preventDefault();
      send(new FormData(event.currentTarget));
    },
    submit: (values) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(values)) formData.set(key, value);
      send(formData);
    },
    pending,
    formError: shownOnField ? null : error,
    fieldErrors,
    saved: result?.ok === true,
  };
}
