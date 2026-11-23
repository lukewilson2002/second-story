import type { ReactNode } from "react";
import { PASTEL_BG, type PastelTone } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface TileProps {
  tone: PastelTone;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  className?: string;
}

/**
 * A pastel KPI tile.
 * From 768px it is the dashboard board's tile: uppercase label and a 34px number.
 * Below that it is the phone board's smaller tile: plain label and a 24px number.
 */
export function Tile({ tone, label, value, detail, className }: TileProps) {
  return (
    <div className={cn("rounded-card px-3.5 py-3 md:px-5 md:py-[18px]", PASTEL_BG[tone], className)}>
      <div className="text-[12px] font-semibold text-ink-secondary md:tracking-[0.04em] md:uppercase">{label}</div>
      <div className="font-display text-[24px] leading-[1.2] font-bold tabular-nums md:mt-1.5 md:text-[34px]">{value}</div>
      <div className="text-[13px] text-ink-secondary md:mt-0.5 md:text-[14px]">{detail}</div>
    </div>
  );
}
