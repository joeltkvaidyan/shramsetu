import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { Card } from "../components/Card";
import { PrimaryButton } from "../components/Buttons";
import { GrievanceStatusBadge } from "../components/GrievanceStatusBadge";
import { api } from "../api/client";
import type { Grievance } from "../types";

export default function GrievanceListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api
        .get<Grievance[]>("/grievances", { params: { limit: 100 } })
        .then((res) => setGrievances(res.data))
        .finally(() => setLoading(false));
    }, [])
  );

  return (
    <Screen title={t("grievance.title")}>
      <PrimaryButton onPress={() => navigation.navigate("GrievanceForm")} className="mb-6">
        {`＋ ${t("grievance.fileNew")}`}
      </PrimaryButton>

      {loading ? (
        <ActivityIndicator className="mt-10" />
      ) : grievances.length === 0 ? (
        <Text className="text-gray-400 text-center py-10">{t("grievance.noComplaints")}</Text>
      ) : (
        <View className="gap-3">
          {grievances.map((g) => (
            <TouchableOpacity key={g.id} onPress={() => navigation.navigate("GrievanceDetail", { id: g.id })} activeOpacity={0.8}>
              <Card>
                <View className="flex-row items-start justify-between mb-1.5">
                  <Text className="text-xs font-mono text-gray-400">{g.complaint_number}</Text>
                  <GrievanceStatusBadge status={g.status} />
                </View>
                <Text className="font-semibold text-gray-900 dark:text-gray-100" numberOfLines={1}>
                  {g.subject}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(`grievance.categories.${g.category}`)} · {new Date(g.created_at).toLocaleDateString()}
                </Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Screen>
  );
}
