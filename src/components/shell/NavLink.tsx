"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** True if `pathname` is `href` or a page under it. "/" only matches itself. */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavLinkProps {
  href: string;
  className: string;
  /** Classes added when this is the current section. */
  currentClassName: string;
  /** Classes added when it is not. */
  idleClassName: string;
  children: ReactNode;
  "aria-label"?: string;
}

/** A nav link that marks itself with aria-current="page" when the URL is in its section. */
export function NavLink({ href, className, currentClassName, idleClassName, children, ...props }: NavLinkProps) {
  const current = isCurrentPath(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(className, current ? currentClassName : idleClassName)}
      {...props}
    >
      {children}
    </Link>
  );
}
