import type { PriceSource, SourceInfo } from "../types";
import { ebaySource } from "./ebay";
import { priceChartingSource } from "./pricecharting";

/** Every price source, in the order the lookup page shows them. Add a new source here. */
export const PRICE_SOURCES: readonly PriceSource[] = [priceChartingSource, ebaySource];

export function sourceInfo(source: PriceSource): SourceInfo {
  return {
    id: source.id,
    label: source.label,
    siteName: source.siteName,
    description: source.description,
    configured: source.isConfigured(),
    setupHint: source.setupHint,
  };
}
