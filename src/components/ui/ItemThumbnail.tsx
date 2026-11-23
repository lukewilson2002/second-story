import Image from "next/image";
import { cn } from "@/lib/cn";
import { categoryCode } from "@/lib/domain/categories";
import { PASTEL_BG, type PastelTone } from "./Card";

const THUMBNAIL_TONES: readonly PastelTone[] = ["lilac", "peach", "pink", "mint", "sky", "butter"];

/**
 * Picks a pastel for a category, so the same category always gets the same colour.
 * Pass the id of the top-level category (see `topLevelCategoryId`) so DVD, Blu-ray and VHS share Movie's colour.
 */
export function thumbnailTone(categoryKey: string): PastelTone {
  let hash = 0;
  for (const char of categoryKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return THUMBNAIL_TONES[hash % THUMBNAIL_TONES.length] ?? "lilac";
}

export interface ItemThumbnailProps {
  /** A ready-to-use image URL (see `cloudinaryImageUrl`). Null or undefined shows the pastel fallback. */
  imageUrl?: string | null | undefined;
  /** The item's own category name, for the short code on the fallback ("DVD", "BK"). */
  categoryName: string;
  /** What the colour is keyed on. Usually the top-level category id. Defaults to the category name. */
  toneKey?: string;
  size?: number;
  className?: string;
}

/**
 * An item's thumbnail: its first photo, or a pastel square with a short category code when it has none.
 * It is decorative. The item title next to it is what names the row.
 */
export function ItemThumbnail({ imageUrl, categoryName, toneKey, size = 40, className }: ItemThumbnailProps) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 rounded-control object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-control text-[11px] font-semibold text-ink",
        PASTEL_BG[thumbnailTone(toneKey ?? categoryName)],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {categoryCode(categoryName)}
    </span>
  );
}
