import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, Pill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { longMonthLabel } from "../labels";
import { addMonths, monthHref, type MonthKey } from "../month";

const ARROW = "flex size-11 items-center justify-center rounded-control text-ink";

function Arrow({ label, href, children }: { label: string; href: string | null; children: React.ReactNode }) {
  if (href === null) {
    // A link with nowhere to go. It stays in place so the month name does not jump, and is announced as unavailable.
    return (
      <span role="link" aria-disabled="true" aria-label={label} className={cn(ARROW, "cursor-not-allowed opacity-35")}>
        {children}
      </span>
    );
  }
  return (
    // The page keeps its scroll position, because on a phone the switcher sits part way down.
    <Link href={href} scroll={false} aria-label={label} className={cn(ARROW, "hover:bg-ground")}>
      {children}
    </Link>
  );
}

export interface MonthSwitcherProps {
  month: MonthKey;
  currentMonth: MonthKey;
  /** The previous arrow stops here. */
  earliestMonth: MonthKey;
  className?: string;
}

/**
 * Previous and next arrows around the month name. The month lives in the URL as `?month=YYYY-MM`.
 * The next arrow stops at the current month. If an earlier month is shown, a "Back to this month" link appears.
 */
export function MonthSwitcher({ month, currentMonth, earliestMonth, className }: MonthSwitcherProps) {
  const isPast = month < currentMonth;
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      <div role="group" aria-label="Month shown" className="flex items-center rounded-control border border-border-input bg-surface">
        <Arrow label="Previous month" href={month > earliestMonth ? monthHref(addMonths(month, -1), currentMonth) : null}>
          <ChevronLeftIcon size={18} strokeWidth={2.5} />
        </Arrow>
        <span aria-live="polite" className="min-w-[136px] text-center text-[15px] font-semibold">
          {longMonthLabel(month)}
        </span>
        <Arrow label="Next month" href={isPast ? monthHref(addMonths(month, 1), currentMonth) : null}>
          <ChevronRightIcon size={18} strokeWidth={2.5} />
        </Arrow>
      </div>
      <Pill tone="lilac">{isPast ? "Full month" : "Month to date"}</Pill>
      {isPast ? (
        <Link
          href="/"
          scroll={false}
          className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-primary-text no-underline hover:bg-lilac"
        >
          Back to this month
        </Link>
      ) : null}
    </div>
  );
}
