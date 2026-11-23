import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Card, CardTitle, ChevronRightIcon, LogoutIcon, buttonClasses } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain/categories";
import { loadFeeRules } from "@/lib/domain/fees";
import { formatBps, formatCount } from "@/lib/format";
import { loadCommissionDefaults, loadMarketplaces, loadOwnerEmail } from "@/features/settings/data";

export const metadata: Metadata = { title: "Settings" };

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

function SettingsLink({ href, title, detail, badge }: { href: string; title: string; detail: string; badge?: ReactNode }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link href={href} className="flex min-h-16 items-center gap-3 px-5 py-3 text-ink no-underline hover:bg-ground">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-ink-muted">{detail}</span>
        </span>
        {badge}
        <ChevronRightIcon size={18} className="shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

export default async function Page() {
  const userId = await requireUser();
  const db = getDb();
  const [categories, marketplaces, feeRules, commission, email] = await Promise.all([
    loadCategories(db, userId),
    loadMarketplaces(db, userId),
    loadFeeRules(db, userId),
    loadCommissionDefaults(db, userId),
    loadOwnerEmail(db, userId),
  ]);

  const activeCategories = categories.filter((category) => !category.archived).length;
  const archivedCategories = categories.length - activeCategories;
  const activeMarketplaces = marketplaces.filter((marketplace) => !marketplace.archived);
  const withFees = new Set(feeRules.map((rule) => rule.marketplaceId));
  const withoutFees = activeMarketplaces.filter((marketplace) => !withFees.has(marketplace.id)).length;

  const commissionDetail =
    commission.defaultCommissionBps === null && commission.defaultCommissionPayee === null
      ? "Not set. New listings start with no commission."
      : [
          commission.defaultCommissionBps === null ? null : `${formatBps(commission.defaultCommissionBps)} of profit`,
          commission.defaultCommissionPayee === null ? null : `paid to ${commission.defaultCommissionPayee}`,
        ]
          .filter((part) => part !== null)
          .join(", ");

  return (
    <>
      <PageHeader title="Settings" />

      <Card padding="none" aria-label="Settings sections" className="overflow-hidden">
        <ul>
          <SettingsLink
            href="/settings/categories"
            title="Categories"
            detail={
              archivedCategories > 0
                ? `${plural(activeCategories, "category", "categories")}, ${formatCount(archivedCategories)} archived`
                : plural(activeCategories, "category", "categories")
            }
          />
          <SettingsLink
            href="/settings/marketplaces"
            title="Marketplaces and fee rules"
            detail={
              withoutFees > 0
                ? `${plural(activeMarketplaces.length, "marketplace", "marketplaces")}. ${formatCount(withoutFees)} still ${withoutFees === 1 ? "needs its" : "need their"} fees entered.`
                : plural(activeMarketplaces.length, "marketplace", "marketplaces")
            }
            badge={withoutFees > 0 ? <Badge>{formatCount(withoutFees)}</Badge> : undefined}
          />
          <SettingsLink href="/settings/commission" title="Default commission" detail={commissionDetail} />
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Account</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink-muted">Signed in as</p>
            <p className="font-medium break-all">{email ?? "Unknown"}</p>
          </div>
          <LogoutButton className={buttonClasses("secondary")}>
            <LogoutIcon size={18} />
            Log out
          </LogoutButton>
        </div>
      </Card>
    </>
  );
}
