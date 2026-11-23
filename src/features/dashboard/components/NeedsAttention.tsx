import Link from "next/link";
import { Badge, ChevronRightIcon, type PastelTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCents, formatCount } from "@/lib/format";
import type { NeedsAttention as NeedsAttentionData } from "../queries";

interface Row {
  href: string;
  tone: PastelTone;
  badge: string;
  /** The dashboard board's wording. */
  label: string;
  /** The phone board's shorter wording. */
  shortLabel: string;
}

function rowsFor(data: NeedsAttentionData): Row[] {
  return [
    {
      href: "/inventory?status=in_stock",
      tone: "sky",
      badge: formatCount(data.unlistedItems),
      label: "Items in stock that are not listed",
      shortLabel: "Items not listed",
    },
    {
      href: "/listings?filter=below-minimum",
      tone: "peach",
      badge: formatCount(data.listingsBelowMinimum),
      label: "Listings priced below their minimum",
      shortLabel: "Priced below minimum",
    },
    {
      href: "/listings?filter=stale",
      tone: "butter",
      badge: formatCount(data.staleListings),
      label: "Listings active for more than 60 days",
      shortLabel: "Listed over 60 days",
    },
    {
      href: "/listings?filter=still-up",
      tone: "pink",
      badge: formatCount(data.soldStillUp),
      label: "Sold listings still up on another marketplace",
      shortLabel: "Sold, still up elsewhere",
    },
    {
      href: "/sales?filter=commission-owed",
      tone: "lilac",
      badge: formatCents(data.commissionOwedCents),
      label: "Commission owed and not yet paid",
      shortLabel: "Commission owed",
    },
  ];
}

/** The needs-attention rows: a pastel count badge, a label and a chevron. Each row links into the filtered view. */
export function NeedsAttentionList({ data, compact = false }: { data: NeedsAttentionData; compact?: boolean }) {
  const rows = rowsFor(data);
  return (
    <ul>
      {rows.map((row, index) => (
        <li key={row.href}>
          <Link
            href={row.href}
            className={cn(
              "flex min-h-12 items-center gap-3 text-ink no-underline hover:text-primary-text",
              index < rows.length - 1 && "border-b border-border",
            )}
          >
            <Badge tone={row.tone}>{row.badge}</Badge>
            <span className="flex-1">{compact ? row.shortLabel : row.label}</span>
            <ChevronRightIcon size={16} className="shrink-0 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
