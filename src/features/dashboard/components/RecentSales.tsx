import { cn } from "@/lib/cn";
import { formatCents, formatShortDate } from "@/lib/format";
import type { RecentSale } from "../queries";

const EMPTY = "No sales yet. Mark a listing sold and it shows up here.";

function profitClass(profitCents: number): string {
  return profitCents < 0 ? "text-danger" : "text-profit";
}

/** The dashboard board's recent sales table. It scrolls sideways inside its card when the card is narrow. */
export function RecentSalesTable({ sales }: { sales: readonly RecentSale[] }) {
  if (sales.length === 0) return <p className="py-6 text-center text-ink-muted">{EMPTY}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse tabular-nums">
        <caption className="visually-hidden">Recent sales</caption>
        <thead>
          <tr className="text-left text-[12px] text-ink-muted">
            <th scope="col" className="py-2 pr-2 font-semibold">Date</th>
            <th scope="col" className="p-2 font-semibold">Listing</th>
            <th scope="col" className="p-2 font-semibold">Sold on</th>
            <th scope="col" className="p-2 text-right font-semibold">Price</th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold">Profit</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id} className="border-t border-border">
              <td className="py-[11px] pr-2 whitespace-nowrap text-ink-muted">{formatShortDate(sale.soldAt)}</td>
              <td className="px-2 py-[11px]">{sale.listingTitle}</td>
              <td className="px-2 py-[11px]">{sale.marketplaceName}</td>
              <td className="px-2 py-[11px] text-right">{formatCents(sale.salePriceCents)}</td>
              <td className={cn("py-[11px] pl-2 text-right font-semibold", profitClass(sale.profitCents))}>
                {formatCents(sale.profitCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The phone board's recent sales: the listing on one line, then date, marketplace and price, with profit on the right. */
export function RecentSalesList({ sales }: { sales: readonly RecentSale[] }) {
  if (sales.length === 0) return <p className="py-4 text-ink-muted">{EMPTY}</p>;
  return (
    <ul>
      {sales.map((sale, index) => (
        <li
          key={sale.id}
          className={cn("flex min-h-[50px] items-center gap-3 py-1.5 tabular-nums", index < sales.length - 1 && "border-b border-border")}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{sale.listingTitle}</div>
            <div className="text-[13px] text-ink-muted">
              {formatShortDate(sale.soldAt)}, {sale.marketplaceName}, {formatCents(sale.salePriceCents)}
            </div>
          </div>
          <span className={cn("font-semibold", profitClass(sale.profitCents))}>
            <span className="visually-hidden">Profit </span>
            {formatCents(sale.profitCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
