import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";

const ROLES = [
  { key: "worker", icon: "👷", screen: "WorkerLogin" },
  { key: "employer", icon: "🏢", screen: "ComingSoon" },
  { key: "government", icon: "🏛️", screen: "ComingSoon" },
  { key: "insurance", icon: "🛡️", screen: "ComingSoon" },
] as const;

export default function RoleSelectScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  return (
    <Screen>
      <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
        {t("role.select")}
      </Text>
      <View className="gap-3">
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.key}
            onPress={() => navigation.navigate(role.screen, { role: role.key })}
            activeOpacity={0.8}
            className="flex-row items-center gap-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-5 shadow-sm"
          >
            <Text className="text-3xl">{role.icon}</Text>
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">
              {t(`role.${role.key}`)}
            </Text>
            <Text className="text-gray-400 text-xl">›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}
