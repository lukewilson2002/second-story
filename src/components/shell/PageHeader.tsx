import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Breadcrumb {
  label: string;
  /** Leave it out for the current page, which is plain text. */
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  /** Shown above the title, for example Listings / New. */
  breadcrumbs?: readonly Breadcrumb[];
  /** One muted line under the title, for example "96 items, 142 units in stock, $1,864 cost". */
  description?: ReactNode;
  /** Buttons on the right. They wrap under the title on narrow screens. */
  actions?: ReactNode;
  /** Controls under the title row, like the dashboard month switcher. */
  children?: ReactNode;
  className?: string;
}

/** The top of every page: optional breadcrumbs, the h1, an optional description, and actions on the right. */
export function PageHeader({ title, breadcrumbs, description, actions, children, className }: PageHeaderProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="mb-0.5 text-ink-muted">
              <ol className="flex flex-wrap items-center gap-1.5">
                {breadcrumbs.map((crumb, index) => (
                  <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                    {index > 0 ? <span aria-hidden="true">/</span> : null}
                    {crumb.href ? (
                      <Link href={crumb.href} className="inline-flex min-h-11 items-center text-ink-muted underline hover:text-ink">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page">{crumb.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <h1 className="text-h1">{title}</h1>
          {description ? <p className="mt-0.5 text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className={cn("flex flex-wrap gap-2")}>{actions}</div> : null}
      </div>
      {children ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );
}
