"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** Names the group for screen readers, for example "Status". */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

const TRACK = "inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-control bg-sidebar p-[3px]";
const SEGMENT =
  "inline-flex min-h-11 items-center justify-center rounded-inner px-3.5 text-[14px] whitespace-nowrap cursor-pointer transition-colors";
const SEGMENT_ON = "bg-surface font-semibold text-primary-text";
const SEGMENT_OFF = "bg-transparent font-medium text-ink-secondary hover:text-ink";

/**
 * A row of buttons where exactly one is pressed, like the inventory status filter.
 * The boards draw 38px segments. They are 44px here to meet the minimum control height.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn(TRACK, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(SEGMENT, option.value === value ? SEGMENT_ON : SEGMENT_OFF)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TabItem {
  /** Where the tab goes. Tabs are links, so the current tab lives in the URL and survives a reload. */
  href: string;
  label: ReactNode;
  /** Optional count shown after the label. */
  count?: number | undefined;
  current: boolean;
}

/**
 * Tabs for switching views of one page, like Active, Sold and Ended on Listings.
 * Each tab is a link. Mark the one being shown with `current`.
 */
export function Tabs({ label, items, className }: { label: string; items: readonly TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn(TRACK, className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(SEGMENT, "gap-1.5 no-underline", item.current ? SEGMENT_ON : SEGMENT_OFF)}
        >
          {item.label}
          {item.count !== undefined ? <span className="tabular-nums text-ink-muted">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
