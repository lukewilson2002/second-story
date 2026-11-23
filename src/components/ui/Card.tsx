import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** "none" drops the padding, for cards that hold a table edge to edge. */
  padding?: "md" | "none";
  /** The element to render. Use "section" with a CardTitle, "div" otherwise. */
  as?: "section" | "div" | "aside";
}

/** A white card: 16px radius, 1px border, 20px padding. `min-w-0` lets a wide table inside it scroll instead of stretching the page. */
export function Card({ padding = "md", as: Tag = "section", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn("min-w-0 rounded-card border border-border bg-surface", padding === "md" && "p-5", className)}
      {...props}
    />
  );
}

/** A card heading (h2, Outfit 17px). */
export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-h2", className)}>{children}</h2>;
}

export type PastelTone = "lilac" | "mint" | "sky" | "peach" | "pink" | "butter";

export const PASTEL_BG: Record<PastelTone, string> = {
  lilac: "bg-lilac",
  mint: "bg-mint",
  sky: "bg-sky",
  peach: "bg-peach",
  pink: "bg-pink",
  butter: "bg-butter",
};

export interface StatTileProps {
  tone: PastelTone;
  /** Small uppercase label, for example "Profit". */
  label: string;
  /** The big number, already formatted. */
  value: ReactNode;
  /** The line under the number, for example "47.6% margin". */
  detail?: ReactNode;
  className?: string;
}

/** A pastel KPI tile from the dashboard board. */
export function StatTile({ tone, label, value, detail, className }: StatTileProps) {
  return (
    <div className={cn("rounded-card px-5 py-[18px]", PASTEL_BG[tone], className)}>
      <div className="text-eyebrow">{label}</div>
      <div className="mt-1.5 text-stat">{value}</div>
      {detail ? <div className="mt-0.5 text-ink-secondary">{detail}</div> : null}
    </div>
  );
}
