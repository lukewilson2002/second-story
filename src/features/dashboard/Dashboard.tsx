import { PageHeader } from "@/components/shell";
import { Card, CardTitle } from "@/components/ui";
import { formatBps, formatCents, formatCount } from "@/lib/format";
import { BarList } from "./components/BarList";
import { InventoryAge } from "./components/InventoryAge";
import { MonthSwitcher } from "./components/MonthSwitcher";
import { NeedsAttentionList } from "./components/NeedsAttention";
import { RecentSalesList, RecentSalesTable } from "./components/RecentSales";
import { Tile } from "./components/Tile";
import { ProfitRevenueChart, SpendRevenueChart } from "./components/TrendCharts";
import { longMonthLabel, shortMonthLabel, weekLabel } from "./labels";
import { monthOf, type MonthKey } from "./month";
import type { DashboardData } from "./queries";

export interface DashboardProps {
  data: DashboardData;
  currentMonth: MonthKey;
  earliestMonth: MonthKey;
}

const PHONE_CARD = "rounded-card border border-border bg-surface px-3.5 pt-3 pb-1";
const PHONE_TITLE = "mb-1 font-display text-[16px] font-semibold";

function salesCount(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "sale" : "sales"}`;
}

/**
 * The home screen.
 * From 768px it follows the dashboard board: month switcher, five tiles, charts, then needs attention and recent sales.
 * Below that it follows the phone board: a lilac header with the month's profit, two tiles, needs attention and recent sales.
 * The phone board stops there. The month switcher, average days to sell and the charts follow below it, so a phone can still reach them.
 * The pieces that differ between the two are rendered once for each and hidden with CSS, so only one is ever in the tab order.
 */
export function Dashboard({ data, currentMonth, earliestMonth }: DashboardProps) {
  const { summary, stock, activeListings, month } = data;
  const isCurrent = month === currentMonth;
  const monthName = longMonthLabel(month);
  const margin = summary.marginBps === null ? null : formatBps(summary.marginBps, { fractionDigits: 1 });
  const profit = formatCents(summary.profitCents, { whole: true });
  const averageDays = data.averageDaysToSell === null ? "–" : formatCount(data.averageDaysToSell);
  const averageDaysDetail =
    data.averageDaysToSell === null ? `no sales in ${isCurrent ? "this month" : monthName}` : "from listed to sold";

  const monthly = data.monthlyTrend.map((point) => ({
    label: shortMonthLabel(point.key),
    name: longMonthLabel(point.key),
    profitCents: point.profitCents,
    revenueCents: point.revenueCents,
    current: point.key === month,
  }));
  const lastWeek = data.weeklyTrend.at(-1)?.key;
  const weekly = data.weeklyTrend.map((point) => ({
    label: weekLabel(point.key),
    name: `Week of ${weekLabel(point.key)}`,
    profitCents: point.profitCents,
    revenueCents: point.revenueCents,
    // For the current month this is the week in progress. For an earlier month, every week that starts in it.
    current: isCurrent ? point.key === lastWeek : monthOf(point.key) === month,
  }));
  const spend = data.spendVsRevenue.map((point) => ({
    label: shortMonthLabel(point.month),
    name: longMonthLabel(point.month),
    spendCents: point.spendCents,
    revenueCents: point.revenueCents,
  }));
  const noSales = `No sales in ${isCurrent ? "this month" : monthName} yet.`;
  const switcher = { month, currentMonth, earliestMonth };

  return (
    <>
      <PageHeader title="Dashboard" className="hidden md:block">
        <MonthSwitcher {...switcher} />
      </PageHeader>

      {/* Joins the shell's lilac top bar, as on the phone board. */}
      <div className="-mx-4 -mt-4 rounded-b-3xl bg-lilac px-4 pt-2.5 pb-[18px] md:hidden">
        <h1 className="visually-hidden">Dashboard</h1>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-eyebrow">{isCurrent ? "Profit this month" : `Profit in ${monthName}`}</div>
            <div className="font-display text-[36px] leading-[1.15] font-bold tabular-nums">{profit}</div>
          </div>
          <div className="text-right text-ink-secondary">
            {salesCount(summary.sales)}
            <br />
            {margin === null ? "no margin yet" : `${margin} margin`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-4">
        <Tile
          tone="lilac"
          label="Profit"
          value={profit}
          detail={margin === null ? "no sales yet" : `${margin} margin`}
          className="hidden md:block"
        />
        <Tile
          tone="mint"
          label="Sales"
          value={formatCount(summary.sales)}
          detail={`${formatCents(summary.revenueCents, { whole: true })} revenue`}
          className="hidden md:block"
        />
        <Tile
          tone="sky"
          label="In stock"
          value={formatCount(stock.units)}
          detail={
            <>
              <span className="hidden md:inline">{stock.units === 1 ? "unit, " : "units, "}</span>
              {formatCents(stock.costCents, { whole: true })} cost
            </>
          }
        />
        <Tile
          tone="peach"
          label="Active listings"
          value={formatCount(activeListings.count)}
          detail={`${formatCents(activeListings.askingCents, { whole: true })} asking`}
        />
        <Tile tone="pink" label="Avg days to sell" value={averageDays} detail={averageDaysDetail} className="hidden md:block" />
      </div>

      <div className="flex flex-col gap-3.5 md:hidden">
        <section className={PHONE_CARD}>
          <h2 className={PHONE_TITLE}>Needs attention</h2>
          <NeedsAttentionList data={data.needsAttention} compact />
        </section>
        <section className={PHONE_CARD}>
          <h2 className={PHONE_TITLE}>Recent sales</h2>
          <RecentSalesList sales={data.recentSales} />
        </section>
        <MonthSwitcher {...switcher} className="mt-2" />
        <Tile tone="pink" label="Avg days to sell" value={averageDays} detail={averageDaysDetail} />
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] md:gap-4">
        <Card>
          <ProfitRevenueChart monthly={monthly} weekly={weekly} />
        </Card>
        <Card>
          <CardTitle className="mb-4">Profit by marketplace</CardTitle>
          <BarList
            rows={data.profitByMarketplace.map((slice) => ({ key: slice.id ?? "none", label: slice.name, valueCents: slice.profitCents }))}
            empty={noSales}
          />
        </Card>
        <Card>
          <CardTitle className="mb-4">Profit by category</CardTitle>
          <BarList
            rows={data.profitByCategory.map((slice) => ({ key: slice.id ?? "none", label: slice.name, valueCents: slice.profitCents }))}
            empty={noSales}
          />
        </Card>
        <Card>
          <CardTitle className="mb-4">Inventory age</CardTitle>
          <InventoryAge buckets={stock.ageBuckets} />
        </Card>
        <Card>
          <SpendRevenueChart points={spend} />
        </Card>
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <Card>
          <CardTitle className="mb-2">Needs attention</CardTitle>
          <NeedsAttentionList data={data.needsAttention} />
        </Card>
        <Card>
          <CardTitle className="mb-2">Recent sales</CardTitle>
          <RecentSalesTable sales={data.recentSales} />
        </Card>
      </div>
    </>
  );
}
