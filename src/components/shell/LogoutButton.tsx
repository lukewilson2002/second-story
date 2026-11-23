import type { ReactNode } from "react";
import { logout } from "@/lib/auth/actions";

/** A form with one button that signs the owner out. It works without JavaScript. */
export function LogoutButton({ className, children, "aria-label": ariaLabel }: { className: string; children: ReactNode; "aria-label"?: string }) {
  return (
    <form action={logout}>
      <button type="submit" className={className} aria-label={ariaLabel}>
        {children}
      </button>
    </form>
  );
}
