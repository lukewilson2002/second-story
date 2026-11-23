import Link from "next/link";
import type { ReactNode } from "react";
import { BarsIcon, BoxIcon, GearIcon, HomeIcon, LogoIcon, LogoutIcon, SearchIcon, TagIcon } from "@/components/ui/icons";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";

const SIDEBAR_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/listings", label: "Listings" },
  { href: "/sales", label: "Sales" },
  { href: "/lookup", label: "Price lookup" },
  { href: "/settings", label: "Settings" },
] as const;

const BOTTOM_ITEMS = [
  { href: "/", label: "Home", icon: <HomeIcon /> },
  { href: "/inventory", label: "Inventory", icon: <BoxIcon /> },
  { href: "/listings", label: "Listings", icon: <TagIcon /> },
  { href: "/sales", label: "Sales", icon: <BarsIcon /> },
] as const;

const TOP_BAR_BUTTON =
  "flex size-11 items-center justify-center rounded-control text-ink hover:bg-surface/60 cursor-pointer";

export interface AppShellProps {
  /** The page. */
  children: ReactNode;
  /** The quick-actions + button. The shell positions it: bottom right on desktop, above the bottom nav on a phone. */
  quickActions: ReactNode;
}

/**
 * The frame around every signed-in page.
 * From 768px up it is a lilac sidebar with the current section as a white pill.
 * Below that it is a lilac top bar (brand, Price lookup, Settings, Log out) and a four-item bottom nav.
 */
export function AppShell({ children, quickActions }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-[216px] shrink-0 flex-col gap-7 overflow-y-auto bg-sidebar px-4 py-6 md:flex"
      >
        <Link href="/" className="flex min-h-11 items-center gap-2.5 px-2 text-ink no-underline">
          <LogoIcon />
          <span className="font-display text-[19px] font-bold">Second Story</span>
        </Link>
        <div className="flex flex-col gap-1">
          {SIDEBAR_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center rounded-control px-3 no-underline"
              currentClassName="bg-surface font-semibold text-primary-text"
              idleClassName="font-medium text-ink-secondary hover:bg-surface/60 hover:text-ink"
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-auto">
          <LogoutButton className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-control px-3 font-medium text-ink-secondary hover:bg-surface/60 hover:text-ink">
            <LogoutIcon size={18} />
            Log out
          </LogoutButton>
        </div>
      </nav>

      <header className="flex items-center justify-between gap-2 bg-lilac px-4 pt-3 pb-1 md:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-ink no-underline">
          <LogoIcon size={24} holeColor="var(--color-lilac)" />
          <span className="font-display text-[19px] font-bold">Second Story</span>
        </Link>
        <div className="flex items-center">
          <Link href="/lookup" aria-label="Price lookup" className={TOP_BAR_BUTTON}>
            <SearchIcon />
          </Link>
          <Link href="/settings" aria-label="Settings" className={TOP_BAR_BUTTON}>
            <GearIcon />
          </Link>
          <LogoutButton aria-label="Log out" className={TOP_BAR_BUTTON}>
            <LogoutIcon />
          </LogoutButton>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-4 pb-(--shell-bottom-gap) outline-none md:px-8 md:pt-7"
      >
        {children}
      </main>

      <div className="fixed right-4 bottom-[calc(var(--bottom-nav-height)+19px+env(safe-area-inset-bottom,0px))] z-40 flex flex-col items-end gap-3 md:right-7 md:bottom-7">
        {quickActions}
      </div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface px-2 pt-1.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] md:hidden"
      >
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            className="flex min-h-12 flex-col items-center justify-center gap-[3px] text-[12px] no-underline"
            currentClassName="font-semibold text-primary-text"
            idleClassName="font-medium text-ink-muted"
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
