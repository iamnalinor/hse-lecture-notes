import type { JSX } from "react";

type IconProps = { readonly className?: string };

const STROKE = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.75,
  viewBox: "0 0 24 24",
};

/** Exact Lucide `sparkles` icon from prototype.html */
export const SparklesIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
    <path d="M20 2v4" />
    <path d="M22 4h-4" />
    <circle cx="4" cy="20" r="2" />
  </svg>
);

/** Exact Lucide `message-square-plus` icon from prototype.html */
export const NewChatIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
    <path d="M12 8v6" />
    <path d="M9 11h6" />
  </svg>
);

/** Exact centered transparent Telegram paper plane icon (`tgInv`) from prototype.html */
export const TelegramIcon = ({ className }: IconProps): JSX.Element => (
  <svg aria-hidden="true" className={className} viewBox="3.25 4.7 15.6 15.6">
    <path
      d="M16.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      fill="currentColor"
    />
  </svg>
);

export const CloseIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SendIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const StopIcon = ({ className }: IconProps): JSX.Element => (
  <svg aria-hidden="true" className={className} viewBox="0 0 12 12">
    <rect fill="currentColor" height="12" rx="2" width="12" />
  </svg>
);

export const SearchStepIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </svg>
);

export const ReadStepIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
    <path d="M14 3.5V8h4M9 12h6M9 15.5h6" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ChevronIcon = ({ className = "ai-chev" }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ArrowRightIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const QuoteIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12h5zM10 12c0 3-1.5 5-4.5 5M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12h5zM19 12c0 3-1.5 5-4.5 5" />
  </svg>
);

export const CopyIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <rect height="11" rx="2" width="11" x="8.5" y="8.5" />
    <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
);

export const RetryIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9" />
  </svg>
);

export const InfoIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5M12 16.2h.01" />
  </svg>
);

export const TriangleExclamationPointIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="m10.29 3.86-8.11 14a2 2 0 0 0 1.71 3.01h16.22a2 2 0 0 0 1.71-3.01l-8.11-14a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4m0 4h.01" />
  </svg>
);

export const HistoryIcon = ({ className }: IconProps): JSX.Element => (
  <svg {...STROKE} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);
