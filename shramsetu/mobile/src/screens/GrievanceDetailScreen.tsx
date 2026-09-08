import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { Card } from "../components/Card";
import { GrievanceStatusBadge } from "../components/GrievanceStatusBadge";
import { DangerOutlineButton, SecondaryButton } from "../components/Buttons";
import { api } from "../api/client";
import { API_BASE_URL } from "../constants/config";
import type { GrievanceDetail } from "../types";

export default function GrievanceDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const id: number = route.params?.id;

  const [grievance, setGrievance] = useState<GrievanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<GrievanceDetail>(`/grievances/${id}`);
      setGrievance(res.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAttach = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);
      await api.post(`/grievances/${id}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } catch {
      Alert.alert(t("common.error"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = (attachmentId: number) => {
    Alert.alert(t("documents.deleteConfirm"), "", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("documents.delete"),
        style: "destructive",
        onPress: async () => {
          await api.delete(`/grievances/${id}/attachments/${attachmentId}`);
          load();
        },
      },
    ]);
  };

  const handleWithdraw = () => {
    Alert.alert(t("grievance.withdraw"), t("grievance.withdrawConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("grievance.withdraw"),
        style: "destructive",
        onPress: async () => {
          setWithdrawing(true);
          try {
            await api.post(`/grievances/${id}/withdraw`, {});
            await load();
          } finally {
            setWithdrawing(false);
          }
        },
      },
    ]);
  };

  if (loading || !grievance) {
    return (
      <Screen showBack>
        <ActivityIndicator className="mt-10" />
      </Screen>
    );
  }

  const canModify = !["withdrawn", "resolved", "rejected"].includes(grievance.status);

  return (
    <Screen title={grievance.complaint_number} showBack>
      <Card className="mb-4">
        <View className="flex-row items-start justify-between mb-2">
          <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 pr-2">{grievance.subject}</Text>
          <GrievanceStatusBadge status={grievance.status} />
        </View>
        <Text className="text-sm text-gray-600 dark:text-gray-300 mb-3">{grievance.description}</Text>
        <View className="gap-1">
          <DetailRow label={t("grievance.category")} value={t(`grievance.categories.${grievance.category}`)} />
          {grievance.employer_name && <DetailRow label={t("grievance.employerName")} value={grievance.employer_name} />}
          {grievance.incident_location && <DetailRow label={t("grievance.incidentLocation")} value={grievance.incident_location} />}
          {grievance.incident_date && (
            <DetailRow label={t("grievance.incidentDate")} value={new Date(grievance.incident_date).toLocaleDateString()} />
          )}
        </View>
      </Card>

      <Text className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        {t("grievance.attachments")}
      </Text>
      <View className="gap-2 mb-4">
        {grievance.attachments.length === 0 ? (
          <Text className="text-gray-400 text-sm">{t("grievance.noAttachments")}</Text>
        ) : (
          grievance.attachments.map((att) => (
            <Card key={att.id} className="flex-row items-center gap-3 py-3">
              <Text className="text-xl">{att.content_type.includes("pdf") ? "📕" : "🖼️"}</Text>
              <TouchableOpacity
                className="flex-1"
                onPress={() => Linking.openURL(`${API_BASE_URL}/grievances/${id}/attachments/${att.id}/download`)}
              >
                <Text className="text-sm text-brand-700 dark:text-brand-400 font-medium" numberOfLines={1}>
                  {att.original_filename}
                </Text>
              </TouchableOpacity>
              {canModify && (
                <TouchableOpacity onPress={() => handleDeleteAttachment(att.id)}>
                  <Text className="text-red-500 text-xs font-semibold">{t("documents.delete")}</Text>
                </TouchableOpacity>
              )}
            </Card>
          ))
        )}
      </View>

      {canModify && (
        <SecondaryButton onPress={handleAttach} disabled={uploading || grievance.attachments.length >= 5} className="mb-6">
          {uploading ? t("documents.uploading") : `＋ ${t("grievance.addAttachment")}`}
        </SecondaryButton>
      )}

      <Text className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        {t("grievance.timeline")}
      </Text>
      <View className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 gap-4 mb-8">
        {grievance.timeline.map((item, i) => (
          <View key={i}>
            <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t(`grievance.status.${item.status}`, item.status)}
            </Text>
            {item.note && <Text className="text-xs text-gray-500 dark:text-gray-400">{item.note}</Text>}
            <Text className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {canModify && (
        <DangerOutlineButton onPress={handleWithdraw} disabled={withdrawing} className="mb-10">
          {t("grievance.withdraw")}
        </DangerOutlineButton>
      )}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Text className="text-xs text-gray-500 dark:text-gray-400">
      <Text className="font-semibold">{label}: </Text>
      {value}
    </Text>
  );
}
