import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { QuickActions } from "@/features/quick-actions/QuickActions";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Layouts do not re-run on every navigation, so each page still calls requireUser() itself.
  await requireUser();
  return <AppShell quickActions={<QuickActions />}>{children}</AppShell>;
}
