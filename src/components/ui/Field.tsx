"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * What Input, Select, Textarea, MoneyInput, PercentInput and CategoryPicker read from the Field around them.
 * It gives the control its id, aria-describedby and aria-invalid, so the label, hint and error are wired up for free.
 * Outside a Field it returns nothing and the control uses its own props.
 */
export function useFieldControl(): Partial<FieldContextValue> {
  return useContext(FieldContext) ?? {};
}

export interface FieldProps {
  label: ReactNode;
  /** One message, or the string[] from an ActionResult's fieldErrors. The first message is shown. */
  error?: string | readonly string[] | null | undefined;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  className?: string;
  /** One form control. */
  children: ReactNode;
}

/**
 * A label, one control, an optional hint and an error message.
 * Put exactly one control from src/components/ui inside it. A custom control can call `useFieldControl()` itself.
 */
export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const message = typeof error === "string" ? error : error?.[0];
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext value={{ id, describedBy, invalid: Boolean(message) }}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <label htmlFor={id} className="truncate font-medium">
          {label}
          {optional ? <span className="font-normal text-ink-muted"> (optional)</span> : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-[13px] text-ink-muted">
            {hint}
          </p>
        ) : null}
        {message ? (
          <p id={errorId} className="text-[13px] font-medium text-danger">
            {message}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}

/** A form-level message, for the `error` of a failed ActionResult. Announced to screen readers when it appears. */
export function FormError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-control bg-danger-tint px-3 py-2.5 font-medium text-danger", className)}>
      {message}
    </p>
  );
}
