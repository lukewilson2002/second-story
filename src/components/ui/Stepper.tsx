"use client";

import { cn } from "@/lib/cn";
import { MinusIcon, PlusIcon } from "./icons";

export interface StepperProps {
  /** Names the group, for example "Quantity of Ocarina of Time". */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** If set, a hidden input with this name submits the value with the form. */
  name?: string;
  disabled?: boolean;
  className?: string;
}

/** A quantity stepper: minus, the number, plus. Each button is 44px. The buttons stop at `min` and `max`. */
export function Stepper({ label, value, onChange, min = 1, max, name, disabled, className }: StepperProps) {
  const button =
    "flex size-11 items-center justify-center rounded-control bg-transparent text-ink cursor-pointer hover:bg-ground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center rounded-control border border-border-input bg-surface", className)}>
      <button
        type="button"
        aria-label="Decrease quantity"
        className={button}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon size={16} />
      </button>
      <output aria-live="polite" className="min-w-[22px] text-center font-semibold tabular-nums">
        {value}
      </output>
      <button
        type="button"
        aria-label="Increase quantity"
        className={button}
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
      >
        <PlusIcon size={16} />
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
