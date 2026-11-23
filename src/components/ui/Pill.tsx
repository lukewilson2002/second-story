import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ITEM_STATUS_LABELS, type ItemStatus, type ListingStatus } from "@/lib/schemas";
import { PASTEL_BG, type PastelTone } from "./Card";

export type PillTone = PastelTone | "neutral";

const PILL_TONES: Record<PillTone, string> = {
  lilac: "bg-lilac text-lilac-ink",
  sky: "bg-sky text-sky-ink",
  mint: "bg-mint text-profit-strong",
  peach: "bg-peach text-ink-secondary",
  pink: "bg-pink text-ink-secondary",
  butter: "bg-butter text-ink-secondary",
  neutral: "bg-neutral text-ink-secondary",
};

/** A small fully round label, like "Listed" or "Month to date". */
export function Pill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-pill px-2.5 py-1 text-[12px] leading-[1.2] font-semibold whitespace-nowrap",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ITEM_STATUS_TONES: Record<ItemStatus, PillTone> = {
  in_stock: "sky",
  listed: "lilac",
  sold_out: "neutral",
};

const LISTING_STATUS: Record<ListingStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "butter" },
  active: { label: "Active", tone: "lilac" },
  sold: { label: "Sold", tone: "mint" },
  ended: { label: "Ended", tone: "neutral" },
};

/** The status pill for an inventory item: In stock is sky, Listed is lilac, Sold out is grey. */
export function ItemStatusPill({ status }: { status: ItemStatus }) {
  return <Pill tone={ITEM_STATUS_TONES[status]}>{ITEM_STATUS_LABELS[status]}</Pill>;
}

/** The status pill for a listing: Draft, Active, Sold or Ended. */
export function ListingStatusPill({ status }: { status: ListingStatus }) {
  const { label, tone } = LISTING_STATUS[status];
  return <Pill tone={tone}>{label}</Pill>;
}

/** A small squared label for a marketplace name in a table row. */
export function Tag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block rounded-inner border border-border bg-ground px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-ink-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A pastel count badge, as on the needs-attention rows. Holds a count or a short amount. */
export function Badge({ tone = "butter", className, children }: { tone?: PastelTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block min-w-9 rounded-inner px-1.5 py-[3px] text-center font-semibold tabular-nums text-ink",
        PASTEL_BG[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
