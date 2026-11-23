"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BarcodeIcon, CheckIcon, CloseIcon, PlusIcon, SearchIcon, TagIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

interface QuickAction {
  href: string;
  label: string;
  icon: ReactNode;
  /** The pastel behind the icon. The primary action has none: the whole pill is violet. */
  tone?: string;
}

/** In reading order for the keyboard, which is nearest the + button first. On screen the list is drawn bottom to top. */
const ACTIONS: readonly QuickAction[] = [
  { href: "/inventory/new", label: "Add item", icon: <PlusIcon size={18} strokeWidth={2.5} /> },
  { href: "/scan", label: "Scan barcode", icon: <BarcodeIcon size={15} />, tone: "bg-pink" },
  { href: "/listings/new", label: "New listing", icon: <TagIcon size={15} />, tone: "bg-peach" },
  { href: "/sales/new", label: "Mark sold", icon: <CheckIcon size={15} strokeWidth={2.5} />, tone: "bg-mint" },
  { href: "/lookup", label: "Price lookup", icon: <SearchIcon size={15} strokeWidth={2.2} />, tone: "bg-sky" },
];

/**
 * The round + button and the menu it opens: Add item, Scan barcode, New listing, Mark sold, Price lookup.
 * AppShell positions it, bottom right on desktop and above the bottom nav on a phone.
 *
 * The button comes first in the markup and the column is reversed, so Tab moves from the button up through the menu in the order it is drawn.
 * If the menu opens, focus moves to Add item. Up and Down arrows move between the actions.
 * Escape, a click outside, or choosing an action closes it. Escape puts focus back on the button.
 */
export function QuickActions() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("a")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    // The list is drawn bottom to top, so Up goes to the next link in the markup.
    const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (step === 0) return;
    const links = [...(menuRef.current?.querySelectorAll("a") ?? [])];
    const index = links.findIndex((link) => link === document.activeElement);
    const next = links[index + step];
    event.preventDefault();
    if (next) next.focus();
    else if (step === -1) buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="flex flex-col-reverse items-end gap-3">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Quick actions"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex size-[60px] cursor-pointer items-center justify-center rounded-pill bg-primary text-white shadow-fab hover:bg-primary-hover"
      >
        {open ? <CloseIcon size={26} strokeWidth={2.5} /> : <PlusIcon size={26} strokeWidth={2.5} />}
      </button>
      <nav id={menuId} aria-label="Quick actions" hidden={!open}>
        <ul ref={menuRef} onKeyDown={onMenuKeyDown} className="flex flex-col-reverse items-end gap-2">
          {ACTIONS.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-pill font-semibold no-underline",
                  action.tone
                    ? "min-h-[46px] border border-border bg-surface pr-4 pl-[9px] text-[14px] text-ink shadow-menu hover:bg-ground"
                    : "min-h-[52px] bg-primary pr-5 pl-4 text-[15px] text-white shadow-fab hover:bg-primary-hover",
                )}
              >
                {action.tone ? (
                  <span className={cn("flex size-7 items-center justify-center rounded-pill", action.tone)}>{action.icon}</span>
                ) : (
                  action.icon
                )}
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
