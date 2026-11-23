import { formatCents } from "@/lib/format";

const SERIES = ["bg-chart-violet", "bg-chart-green", "bg-chart-orange", "bg-chart-blue"] as const;

export interface BarListRow {
  key: string;
  label: string;
  valueCents: number;
}

/**
 * Labelled horizontal bars, as "Profit by marketplace" is drawn on the dashboard board.
 * The longest bar is the largest value. A loss gets no bar, and its amount is shown in the loss colour.
 * Label and amount are plain text, so nothing here depends on seeing the bar.
 */
export function BarList({ rows, empty }: { rows: readonly BarListRow[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-ink-muted">{empty}</p>;
  const max = Math.max(0, ...rows.map((row) => row.valueCents));
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row, index) => {
        const percent = max > 0 && row.valueCents > 0 ? Math.max(2, Math.round((row.valueCents * 100) / max)) : 0;
        return (
          <li key={row.key}>
            <div className="mb-[5px] flex justify-between gap-3">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className={row.valueCents < 0 ? "font-semibold tabular-nums text-danger" : "font-semibold tabular-nums"}>
                {formatCents(row.valueCents, { whole: true })}
              </span>
            </div>
            <div aria-hidden="true" className="h-3 rounded-[6px] bg-track">
              <div className={`h-3 rounded-[6px] ${SERIES[index % SERIES.length] ?? SERIES[0]}`} style={{ width: `${percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
