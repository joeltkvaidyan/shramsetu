import { CheckCircle2, CircleDot, FileClock, MinusCircle, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GrievanceStatus } from "../types";

/** Status = color + icon + text (never color alone — accessibility spec). */
const STATUS_STYLES: Record<GrievanceStatus, { cls: string; Icon: typeof CircleDot }> = {
  submitted: {
    cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-400/20",
    Icon: FileClock,
  },
  under_review: {
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-400/20",
    Icon: Search,
  },
  resolved: {
    cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 ring-1 ring-inset ring-green-600/20 dark:ring-green-400/20",
    Icon: CheckCircle2,
  },
  rejected: {
    cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 ring-1 ring-inset ring-red-600/20 dark:ring-red-400/20",
    Icon: MinusCircle,
  },
  withdrawn: {
    cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-500/20 dark:ring-gray-400/20",
    Icon: CircleDot,
  },
};

export function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  const { t } = useTranslation();
  const { cls, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cls}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t(`grievance.status.${status}`)}
    </span>
  );
}
