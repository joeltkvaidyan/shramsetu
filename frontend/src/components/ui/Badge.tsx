import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  success: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const dotTones: Record<BadgeTone, string> = {
  neutral: "bg-gray-400",
  brand: "bg-brand-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10 ${tones[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotTones[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
