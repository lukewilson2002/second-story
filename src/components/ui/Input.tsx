"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./Field";

export const CONTROL_CLASSES =
  "w-full min-w-0 rounded-control border border-border-input bg-surface px-3 text-[14px] text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-ground disabled:text-ink-muted aria-invalid:border-danger";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the control as invalid. Inside a Field with an error this is set for you. */
  invalid?: boolean;
}

/** A 44px text input. Inside a Field it picks up its id and error wiring. */
export function Input({ className, invalid, id, ...props }: InputProps) {
  const field = useFieldControl();
  return (
    <input
      id={id ?? field.id}
      aria-describedby={props["aria-describedby"] ?? field.describedBy}
      aria-invalid={invalid || field.invalid || undefined}
      className={cn(CONTROL_CLASSES, "h-11", className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** A 44px native <select>. Pass <option> elements as children. */
export function Select({ className, invalid, id, children, ...props }: SelectProps) {
  const field = useFieldControl();
  return (
    <select
      id={id ?? field.id}
      aria-describedby={props["aria-describedby"] ?? field.describedBy}
      aria-invalid={invalid || field.invalid || undefined}
      className={cn(CONTROL_CLASSES, "h-11 cursor-pointer pr-8 font-medium", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** A multi-line text input, three rows by default. */
export function Textarea({ className, invalid, id, rows = 3, ...props }: TextareaProps) {
  const field = useFieldControl();
  return (
    <textarea
      id={id ?? field.id}
      rows={rows}
      aria-describedby={props["aria-describedby"] ?? field.describedBy}
      aria-invalid={invalid || field.invalid || undefined}
      className={cn(CONTROL_CLASSES, "min-h-11 py-2.5 leading-normal", className)}
      {...props}
    />
  );
}
