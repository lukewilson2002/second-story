"use client";

import { useCallback, useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action";

type FormAction<T> = (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/**
 * Runs a Server Action from a form's `onSubmit` and keeps its result.
 * It is used instead of `<form action>` because React clears every uncontrolled field once a form action finishes,
 * and a form that comes back with a validation error must keep what was typed.
 * The button that submitted the form is included in the FormData, so two submit buttons can carry different values.
 */
export function useFormAction<T>(action: FormAction<T>, onResult?: (result: ActionResult<T>, formData: FormData) => void) {
  const [state, setState] = useState<ActionResult<T> | null>(null);
  const [pending, startTransition] = useTransition();

  /** Runs the action with a FormData built by hand, skipping the browser's own field validation. */
  const submit = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await action(null, formData);
        setState(result);
        onResult?.(result, formData);
      });
    },
    [action, onResult],
  );

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const native = event.nativeEvent;
      const submitter = native instanceof SubmitEvent ? native.submitter : null;
      submit(new FormData(event.currentTarget, submitter));
    },
    [submit],
  );

  return {
    state,
    pending,
    onSubmit,
    submit,
    error: state && !state.ok ? state.error : null,
    fieldErrors: state && !state.ok ? (state.fieldErrors ?? {}) : {},
    clear: useCallback(() => setState(null), []),
  };
}
