import { useTranslation } from "react-i18next";
import type { GrievanceStatus } from "../types";

const STATUS_STYLES: Record<GrievanceStatus, string> = {
  submitted: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  resolved: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

export function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[status]}`}>
      {t(`grievance.status.${status}`)}
    </span>
  );
}
