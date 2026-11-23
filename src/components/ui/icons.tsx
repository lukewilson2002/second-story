import type { SVGProps } from "react";

/**
 * Icons drawn on the boards. They are decorative: every one is aria-hidden, so pair it with visible text or an aria-label on the control.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 20, strokeWidth = 2, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The Second Story price-tag logo. */
export function LogoIcon({ size = 26, holeColor = "var(--color-sidebar)" }: { size?: number; holeColor?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--color-primary)"
      stroke="var(--color-primary)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M3 4h8l10 10-7 7L4 11z" />
      <circle cx="8" cy="8" r="1.6" fill={holeColor} stroke="none" />
    </svg>
  );
}

export const PlusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const MinusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M5 12h14" />
  </Icon>
);
export const CloseIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const CheckIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);
export const SearchIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icon>
);
export const ChevronLeftIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const ChevronRightIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const ChevronUpIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M5 15l7-7 7 7" />
  </Icon>
);
export const ChevronDownIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M5 9l7 7 7-7" />
  </Icon>
);
export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 11l8-7 8 7v9H4z" />
  </Icon>
);
export const BoxIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
    <path d="M4 8l8 4 8-4M12 12v8" />
  </Icon>
);
export const TagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 4h8l10 10-7 7L4 11z" />
  </Icon>
);
export const BarsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 20V10M12 20V4M19 20v-7" />
  </Icon>
);
export const BarcodeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M20 6v12" />
  </Icon>
);
export const GearIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Icon>
);
export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />
  </Icon>
);
export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
  </Icon>
);
export const ExternalLinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </Icon>
);
