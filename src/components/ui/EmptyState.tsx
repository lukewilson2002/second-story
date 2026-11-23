import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Usually one Button or ButtonLink. */
  action?: ReactNode;
  className?: string;
}

/** What a list shows when it has nothing in it: a short title, one line of help, and the next step. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <p className="text-h2">{title}</p>
      {description ? <p className="max-w-md text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
