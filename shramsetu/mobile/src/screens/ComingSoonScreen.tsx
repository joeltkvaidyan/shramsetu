import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { SecondaryButton } from "../components/Buttons";

export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const role: string = route.params?.role ?? "";

  const icons: Record<string, string> = { employer: "🏢", government: "🏛️", insurance: "🛡️" };

  return (
    <Screen showBack>
      <View className="items-center justify-center mt-16">
        <View className="w-24 h-24 rounded-3xl bg-brand-50 dark:bg-brand-900/30 items-center justify-center mb-6">
          <Text className="text-5xl">{icons[role] ?? "🚧"}</Text>
        </View>
        <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {role ? t(`role.${role}`) : ""}
        </Text>
        <Text className="text-xl font-semibold text-brand-600 dark:text-brand-400 mb-3">
          {t("role.comingSoonTitle")}
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center max-w-[280px]">
          {t("role.comingSoonDesc")}
        </Text>

        <View className="mt-10 w-full">
          <SecondaryButton onPress={() => navigation.navigate("Roles")}>
            {t("role.backToRoles")}
          </SecondaryButton>
        </View>
      </View>
    </Screen>
  );
}
