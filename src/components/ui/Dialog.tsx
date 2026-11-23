"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";
import { CloseIcon } from "./icons";

export interface DialogProps {
  open: boolean;
  /** Called when the person closes it: the close button, the Escape key, or a click on the backdrop. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Buttons along the bottom, usually Cancel and the main action. */
  footer?: ReactNode;
  /**
   * "dialog" is centred. On a phone it becomes a sheet that slides up from the bottom.
   * "sheet" is a panel on the right edge on desktop, and the same bottom sheet on a phone.
   */
  variant?: "dialog" | "sheet";
  className?: string;
}

/**
 * A modal built on the native <dialog>, which traps focus, closes on Escape and returns focus when it closes.
 * It is controlled: render it always and switch `open`.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = "dialog", className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        // Without this the browser closes the dialog itself and `open` would be out of step.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-ink backdrop:bg-ink/40",
        "fixed inset-0 size-full",
        "open:flex",
        variant === "dialog"
          ? "items-end justify-center sm:items-center sm:p-6"
          : "items-end justify-center sm:items-stretch sm:justify-end",
      )}
    >
      <div
        className={cn(
          "flex max-h-[90dvh] w-full flex-col bg-surface shadow-menu",
          variant === "dialog"
            ? "rounded-t-card sm:max-w-lg sm:rounded-card"
            : "rounded-t-card sm:max-h-none sm:max-w-md sm:rounded-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="text-h2">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

/** A Dialog that opens as a side panel on desktop and a bottom sheet on a phone. */
export function Sheet(props: Omit<DialogProps, "variant">) {
  return <Dialog {...props} variant="sheet" />;
}
