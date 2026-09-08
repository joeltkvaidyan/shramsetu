import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { GrievanceStatus } from "../types";

const STATUS_STYLES: Record<GrievanceStatus, { bg: string; text: string }> = {
  submitted: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  under_review: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" },
  resolved: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  rejected: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  withdrawn: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300" },
};

export function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status];
  return (
    <View className={`rounded-full px-2.5 py-1 ${style.bg}`}>
      <Text className={`text-xs font-semibold ${style.text}`}>{t(`grievance.status.${status}`)}</Text>
    </View>
  );
}
