import Link from "next/link";
import { PlusIcon } from "@/components/ui/icons";

/**
 * PLACEHOLDER from the foundation. The dashboard feature replaces this file.
 *
 * The real version is the round + button that opens a menu: Add item (nearest the button), Scan barcode, New listing, Mark sold, Price lookup.
 * See the boards in docs/design for the menu's look.
 *
 * AppShell already positions whatever this renders: bottom right on desktop, above the bottom nav on a phone,
 * in a column aligned to the right with a 12px gap. So render the menu first and the round button last, with no positioning of your own.
 * Keep the export name and keep it free of props, because src/app/(app)/layout.tsx renders <QuickActions />.
 */
export function QuickActions() {
  return (
    <Link
      href="/inventory/new"
      aria-label="Add item"
      className="flex size-[60px] items-center justify-center rounded-pill bg-primary text-white shadow-fab hover:bg-primary-hover"
    >
      <PlusIcon size={26} />
    </Link>
  );
}
