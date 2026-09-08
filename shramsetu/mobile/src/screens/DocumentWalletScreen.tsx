import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Alert, Linking, ActivityIndicator, Modal, TextInput } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { Card } from "../components/Card";
import { PrimaryButton } from "../components/Buttons";
import { api, getToken } from "../api/client";
import { API_BASE_URL } from "../constants/config";
import type { DocumentItem } from "../types";

export default function DocumentWalletScreen() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentItem | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DocumentItem[]>("/documents", { params: { limit: 100 } });
      setDocuments(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleUpload = async () => {
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
      form.append("display_name", file.name);
      await api.post("/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } catch {
      Alert.alert(t("common.error"));
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: DocumentItem) => {
    const url = `${API_BASE_URL}/documents/${doc.id}/download`;
    // With STORAGE_BACKEND=local (backend default), this streams via the API
    // and the system browser won't carry our Authorization header — fine for
    // single-instance dev/demo. With STORAGE_BACKEND=s3 (recommended for
    // production), the backend redirects to a short-lived signed URL that
    // works from any browser with no auth header needed — see backend README.
    Linking.openURL(url).catch(() => Alert.alert(t("common.error")));
  };

  const openRename = (doc: DocumentItem) => {
    setRenameTarget(doc);
    setRenameValue(doc.display_name);
  };

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await api.patch(`/documents/${renameTarget.id}`, { display_name: renameValue.trim() });
    setRenameTarget(null);
    load();
  };

  const handleDelete = (doc: DocumentItem) => {
    Alert.alert(t("documents.deleteConfirm"), "", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("documents.delete"),
        style: "destructive",
        onPress: async () => {
          await api.delete(`/documents/${doc.id}`);
          load();
        },
      },
    ]);
  };

  return (
    <Screen title={t("documents.title")}>
      <PrimaryButton onPress={handleUpload} loading={uploading} className="mb-6">
        {uploading ? t("documents.uploading") : `＋ ${t("documents.upload")}`}
      </PrimaryButton>

      <Text className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
        {t("documents.myDocuments")}
      </Text>

      {loading ? (
        <ActivityIndicator className="mt-10" />
      ) : documents.length === 0 ? (
        <Text className="text-gray-400 text-center py-10">{t("documents.noDocuments")}</Text>
      ) : (
        <View className="gap-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <View className="flex-row items-start gap-3">
                <Text className="text-2xl">{doc.content_type.includes("pdf") ? "📕" : "🖼️"}</Text>
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900 dark:text-gray-100" numberOfLines={1}>
                    {doc.display_name}
                  </Text>
                  <Text className="text-xs text-gray-400">{(doc.size_bytes / 1024).toFixed(0)} KB</Text>
                </View>
              </View>
              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity onPress={() => handleView(doc)} className="flex-1 rounded-lg py-2 items-center bg-brand-50 dark:bg-brand-900/30">
                  <Text className="text-sm font-medium text-brand-700 dark:text-brand-300">{t("documents.view")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openRename(doc)} className="flex-1 rounded-lg py-2 items-center bg-gray-100 dark:bg-gray-700">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("documents.rename")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(doc)} className="flex-1 rounded-lg py-2 items-center bg-red-50 dark:bg-red-900/30">
                  <Text className="text-sm font-medium text-red-600 dark:text-red-400">{t("documents.delete")}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>
      )}

      <Modal visible={!!renameTarget} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full">
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              {t("documents.renamePrompt")}
            </Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              className="rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-3 mb-4 text-gray-900 dark:text-gray-100"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setRenameTarget(null)} className="flex-1 items-center py-3">
                <Text className="text-gray-500">{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRename} className="flex-1 items-center py-3 bg-brand-600 rounded-xl">
                <Text className="text-white font-semibold">{t("common.save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
