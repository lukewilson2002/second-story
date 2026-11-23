import { formatCents, formatCount } from "@/lib/format";
import type { AgeBucket, AgeBucketKey } from "../queries";

const BUCKETS: Record<AgeBucketKey, { label: string; color: string }> = {
  fresh: { label: "0 to 30 days", color: "bg-age-fresh" },
  mid: { label: "31 to 90 days", color: "bg-age-mid" },
  old: { label: "Over 90 days", color: "bg-age-old" },
};

/** One stacked bar of the units in stock, split by how long they have been held, with the counts listed under it. */
export function InventoryAge({ buckets }: { buckets: readonly AgeBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.units, 0);
  if (total === 0) return <p className="py-6 text-center text-ink-muted">Nothing in stock right now.</p>;
  const old = buckets.find((bucket) => bucket.key === "old");
  return (
    <>
      <div aria-hidden="true" className="flex h-7 gap-0.5 overflow-hidden rounded-inner">
        {buckets
          .filter((bucket) => bucket.units > 0)
          .map((bucket) => (
            <div key={bucket.key} className={BUCKETS[bucket.key].color} style={{ flexGrow: bucket.units, flexBasis: 0 }} />
          ))}
      </div>
      <ul className="mt-5 flex flex-col gap-3">
        {buckets.map((bucket) => (
          <li key={bucket.key} className="flex items-center gap-2.5">
            <span aria-hidden="true" className={`size-3 rounded-[4px] ${BUCKETS[bucket.key].color}`} />
            <span className="flex-1">{BUCKETS[bucket.key].label}</span>
            <span className="font-semibold tabular-nums">
              {formatCount(bucket.units)} {bucket.units === 1 ? "unit" : "units"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-ink-muted">
        {old && old.units > 0
          ? `Older stock ties up ${formatCents(old.costCents, { whole: true })} of cost.`
          : "Nothing has been held for more than 90 days."}
      </p>
    </>
  );
}
