import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-[14px] font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover px-5",
  secondary: "border border-border-input bg-surface text-ink hover:bg-ground",
  ghost: "bg-transparent text-primary-text hover:bg-lilac px-3",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-tint",
};

/** The class names for a button. Use it when something that is not a Button or ButtonLink must look like one. */
export function buttonClasses(variant: ButtonVariant = "secondary", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shown before the label. Icons are decorative, so the button still needs text or an aria-label. */
  icon?: ReactNode;
}

/**
 * A real <button>, at least 44px tall.
 * `type` defaults to "button", so a Button inside a form only submits when you pass type="submit".
 */
export function Button({ variant = "secondary", icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

/** A Next.js <Link> that looks like a Button. Use it for navigation, and Button for actions. */
export function ButtonLink({ variant = "secondary", icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, cn("no-underline", className))} {...props}>
      {icon}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required. The icon is decorative, so this is the button's name for screen readers. */
  "aria-label": string;
}

/** A 44px square button holding only an icon, like the remove button on a listing item. */
export function IconButton({ className, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-transparent text-ink-muted cursor-pointer transition-colors hover:bg-ground hover:text-ink disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
