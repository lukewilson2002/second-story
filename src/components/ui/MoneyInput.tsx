"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { bpsToInputValue, centsToInputValue, parseDollarsToCents, parsePercentToBps } from "@/lib/format";
import { useFieldControl } from "./Field";
import { CONTROL_CLASSES } from "./Input";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "prefix">;

interface AffixInputProps extends BaseProps {
  text: string;
  onTextChange: (text: string) => void;
  onNormalize: () => void;
  prefix?: string;
  suffix?: string;
  invalid: boolean | undefined;
}

function AffixInput({ text, onTextChange, onNormalize, prefix, suffix, invalid, className, id, onBlur, ...props }: AffixInputProps) {
  const field = useFieldControl();
  return (
    <div className="relative">
      {prefix ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        id={id ?? field.id}
        aria-describedby={props["aria-describedby"] ?? field.describedBy}
        aria-invalid={invalid || field.invalid || undefined}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={(event) => {
          onNormalize();
          onBlur?.(event);
        }}
        className={cn(CONTROL_CLASSES, "h-11 tabular-nums", prefix && "pl-7", suffix && "pr-8", className)}
        {...props}
      />
      {suffix ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface MoneyInputProps extends BaseProps {
  /** Starting value in integer cents. Null or undefined starts empty. */
  defaultValueCents?: number | null | undefined;
  /**
   * Called on every keystroke with integer cents.
   * It gets null while the text is empty or cannot be read as money, so treat null as "no valid amount yet".
   */
  onValueChange?: (cents: number | null) => void;
  invalid?: boolean;
}

/**
 * A dollar field. The person types dollars ("44.99") and your code gets integer cents.
 *
 * The form field submits the typed text under `name`. Parse it on the server with `dollarsFieldSchema` or `optionalDollarsFieldSchema`.
 * On blur a valid amount is tidied to two decimals. Text that cannot be read is left alone so the person can fix it.
 * It keeps its own text, so to load a different value give it a new `key`.
 */
export function MoneyInput({ defaultValueCents, onValueChange, invalid, ...props }: MoneyInputProps) {
  const [text, setText] = useState(defaultValueCents == null ? "" : centsToInputValue(defaultValueCents));
  const cents = parseDollarsToCents(text);
  return (
    <AffixInput
      prefix="$"
      text={text}
      invalid={invalid ?? (text.trim() !== "" && cents === null ? true : undefined)}
      onTextChange={(next) => {
        setText(next);
        onValueChange?.(parseDollarsToCents(next));
      }}
      onNormalize={() => {
        if (cents !== null) setText(centsToInputValue(cents));
      }}
      {...props}
    />
  );
}

export interface PercentInputProps extends BaseProps {
  /** Starting value in basis points (1250 = 12.5%). Null or undefined starts empty. */
  defaultValueBps?: number | null | undefined;
  /** Called on every keystroke with basis points, or null while the text is empty, over 100%, or cannot be read. */
  onValueChange?: (bps: number | null) => void;
  invalid?: boolean;
}

/**
 * A percentage field. The person types a percentage ("12.5") and your code gets basis points.
 * The form field submits the typed text under `name`. Parse it on the server with `percentFieldSchema` or `optionalPercentFieldSchema`.
 */
export function PercentInput({ defaultValueBps, onValueChange, invalid, ...props }: PercentInputProps) {
  const [text, setText] = useState(defaultValueBps == null ? "" : bpsToInputValue(defaultValueBps));
  const bps = parsePercentToBps(text);
  return (
    <AffixInput
      suffix="%"
      text={text}
      invalid={invalid ?? (text.trim() !== "" && bps === null ? true : undefined)}
      onTextChange={(next) => {
        setText(next);
        onValueChange?.(parsePercentToBps(next));
      }}
      onNormalize={() => {
        if (bps !== null) setText(bpsToInputValue(bps));
      }}
      {...props}
    />
  );
}
