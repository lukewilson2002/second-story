"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CardTitle, SegmentedControl } from "@/components/ui";
import { formatCents } from "@/lib/format";

export interface TrendChartPoint {
  /** Axis label: "Nov" for a month, "Nov 16" for the week starting then. */
  label: string;
  /** The full name for the data table: "November 2026" or "Week of Nov 16". */
  name: string;
  profitCents: number;
  revenueCents: number;
  /** True for the bucket the selected month falls in. Its bar is drawn in the primary violet. */
  current: boolean;
}

export interface SpendChartPoint {
  label: string;
  name: string;
  spendCents: number;
  revenueCents: number;
}

type Granularity = "month" | "week";

const GRANULARITY_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
] as const;

const AXIS_TICK = { fontSize: 12, fill: "var(--color-ink-muted)" };
const TOOLTIP_STYLE = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  boxShadow: "var(--shadow-menu)",
  color: "var(--color-ink)",
  fontSize: 13,
};

/** Chart values are integer cents. They are only turned into dollars as text. */
function wholeDollars(value: unknown): string {
  return typeof value === "number" ? formatCents(value, { whole: true }) : "";
}

function dollars(value: unknown): string {
  return typeof value === "number" ? formatCents(value) : "";
}

function LegendKey({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-3 rounded-[4px] ${className}`} />
      {children}
    </span>
  );
}

/**
 * The same numbers as the chart, for screen readers.
 * The drawn chart is hidden from them, because an SVG of bars reads as noise.
 */
function DataTable({ caption, columns, rows }: { caption: string; columns: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <table className="visually-hidden">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Profit as bars and revenue as a line, by month or by week.
 * By month it follows the dashboard board: a value above each bar and no value axis.
 * By week there are too many bars to label, so a value axis is shown.
 */
export function ProfitRevenueChart({ monthly, weekly }: { monthly: readonly TrendChartPoint[]; weekly: readonly TrendChartPoint[] }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const points = granularity === "month" ? monthly : weekly;
  const empty = points.every((point) => point.profitCents === 0 && point.revenueCents === 0);
  // Two stacked series, only one of which has a value in any bucket. That colours the current bar without per-bar cells.
  const data = points.map((point) => ({
    label: point.label,
    revenueCents: point.revenueCents,
    profitOther: point.current ? null : point.profitCents,
    profitCurrent: point.current ? point.profitCents : null,
  }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <CardTitle>Profit and revenue</CardTitle>
        <SegmentedControl label="Group by" options={GRANULARITY_OPTIONS} value={granularity} onChange={setGranularity} />
      </div>
      {empty ? (
        <p className="flex h-[190px] items-center justify-center text-center text-ink-muted">
          No sales in {granularity === "month" ? "these months" : "these weeks"} yet.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={[...data]} margin={{ top: 20, right: 4, bottom: 0, left: 4 }} barCategoryGap="12%" accessibilityLayer={false}>
                {granularity === "week" ? (
                  <>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" />
                    <YAxis width={48} tick={AXIS_TICK} tickFormatter={wholeDollars} axisLine={false} tickLine={false} />
                  </>
                ) : null}
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                  interval={granularity === "week" ? "preserveStartEnd" : 0}
                  minTickGap={granularity === "week" ? 12 : 0}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-track)" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [dollars(value), name === "revenueCents" ? "Revenue" : "Profit"]}
                />
                <Bar dataKey="profitOther" stackId="profit" fill="var(--color-chart-bar)" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {granularity === "month" ? (
                    <LabelList dataKey="profitOther" position="top" formatter={wholeDollars} fontSize={12} fill="var(--color-ink-muted)" />
                  ) : null}
                </Bar>
                <Bar dataKey="profitCurrent" stackId="profit" fill="var(--color-primary)" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {granularity === "month" ? (
                    <LabelList dataKey="profitCurrent" position="top" formatter={wholeDollars} fontSize={12} fontWeight={600} fill="var(--color-ink)" />
                  ) : null}
                </Bar>
                <Line
                  dataKey="revenueCents"
                  type="monotone"
                  stroke="var(--color-chart-green)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--color-chart-green)", strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
            <LegendKey className="bg-chart-bar">Profit</LegendKey>
            <LegendKey className="bg-chart-green">Revenue</LegendKey>
          </div>
        </>
      )}
      <DataTable
        caption={`Profit and revenue by ${granularity}`}
        columns={[granularity === "month" ? "Month" : "Week", "Profit", "Revenue"]}
        rows={points.map((point) => [point.name, formatCents(point.profitCents), formatCents(point.revenueCents)])}
      />
    </>
  );
}

/** What was spent on stock next to what sales brought in, month by month. */
export function SpendRevenueChart({ points }: { points: readonly SpendChartPoint[] }) {
  const empty = points.every((point) => point.spendCents === 0 && point.revenueCents === 0);
  return (
    <>
      <CardTitle className="mb-4">Spend and revenue</CardTitle>
      {empty ? (
        <p className="flex h-[190px] items-center justify-center text-center text-ink-muted">No purchases or sales in these months yet.</p>
      ) : (
        <>
          <div aria-hidden="true" className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={[...points]} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="18%" barGap={3} accessibilityLayer={false}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <YAxis width={48} tick={AXIS_TICK} tickFormatter={wholeDollars} axisLine={false} tickLine={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} interval={0} />
                <Tooltip
                  cursor={{ fill: "var(--color-track)" }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [dollars(value), name === "spendCents" ? "Spend" : "Revenue"]}
                />
                <Bar dataKey="spendCents" fill="var(--color-chart-orange)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="revenueCents" fill="var(--color-chart-green)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
            <LegendKey className="bg-chart-orange">Spend on stock</LegendKey>
            <LegendKey className="bg-chart-green">Revenue</LegendKey>
          </div>
        </>
      )}
      <DataTable
        caption="Spend on stock and revenue by month"
        columns={["Month", "Spend", "Revenue"]}
        rows={points.map((point) => [point.name, formatCents(point.spendCents), formatCents(point.revenueCents)])}
      />
    </>
  );
}
