import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../store/AuthContext";
import { Card } from "../components/Card";

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { worker } = useAuth();
  const navigation = useNavigation<any>();

  if (!worker) return null;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <SafeAreaView edges={["top"]} className="bg-brand-700 rounded-b-3xl">
        <View className="flex-row items-center gap-4 px-5 pt-4 pb-10">
          <View className="w-16 h-16 rounded-full bg-white/15 items-center justify-center overflow-hidden">
            <Text className="text-2xl">👤</Text>
          </View>
          <View>
            <Text className="text-brand-100 text-sm">{t("dashboard.welcome")}</Text>
            <Text className="text-xl font-bold text-white">{worker.full_name}</Text>
          </View>
        </View>
      </SafeAreaView>

      <View className="px-4 -mt-6">
        <Card className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.yourWorkerId")}</Text>
            <Text className="text-lg font-mono font-bold text-brand-700 dark:text-brand-400">
              {worker.worker_id}
            </Text>
          </View>
          {worker.qr_code && (
            <Image source={{ uri: worker.qr_code }} className="w-16 h-16 rounded-lg border border-gray-200" />
          )}
        </Card>

        <View className="flex-row flex-wrap justify-between mt-5">
          <DashboardTile icon="📄" label={t("dashboard.documentWallet")} onPress={() => navigation.navigate("DocumentsTab")} />
          <DashboardTile icon="💬" label={t("dashboard.aiChatbot")} onPress={() => navigation.navigate("ChatTab")} highlight />
          <DashboardTile icon="📢" label={t("grievance.title")} onPress={() => navigation.navigate("GrievancesTab")} />
          <DashboardTile icon="⚙️" label={t("dashboard.settings")} onPress={() => navigation.navigate("SettingsTab")} />
        </View>
      </View>
    </View>
  );
}

function DashboardTile({
  icon,
  label,
  onPress,
  highlight,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`w-[48%] mb-4 rounded-2xl bg-white dark:bg-gray-800 border ${
        highlight ? "border-brand-500 border-2" : "border-gray-100 dark:border-gray-700"
      } items-center justify-center py-6 shadow-sm`}
    >
      <Text className="text-3xl mb-2">{icon}</Text>
      <Text className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-center px-2">{label}</Text>
    </TouchableOpacity>
  );
}
