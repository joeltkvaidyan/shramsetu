import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPPORTED_LANGUAGES } from "../i18n/languages";
import { setStoredLanguage } from "../i18n/index";
import { PrimaryButton } from "../components/Buttons";

export default function LanguageSelectScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const [selected, setSelected] = useState(i18n.language || "en");

  const handleContinue = async () => {
    await i18n.changeLanguage(selected);
    await setStoredLanguage(selected);
    await AsyncStorage.setItem("shramsetu_onboarded_language", "true");
    navigation.replace("Roles");
  };

  return (
    <LinearGradient colors={["#1a7c54", "#144f39"]} className="flex-1">
      <SafeAreaView className="flex-1 justify-center px-6">
        <View className="items-center mb-8">
          <View className="w-20 h-20 rounded-2xl bg-white/10 items-center justify-center mb-4">
            <Text className="text-4xl">🤝</Text>
          </View>
          <Text className="text-3xl font-bold text-white">ShramSetu</Text>
          <Text className="text-brand-100 mt-2 text-base text-center">{t("language.choose")}</Text>
        </View>

        <View className="flex-row flex-wrap justify-between mb-8">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => setSelected(lang.code)}
                activeOpacity={0.8}
                className={`w-[48%] rounded-2xl px-4 py-5 mb-3 ${
                  isSelected ? "bg-white" : "bg-white/10"
                }`}
              >
                <Text className={`text-xl font-semibold ${isSelected ? "text-brand-800" : "text-white"}`}>
                  {lang.nativeName}
                </Text>
                <Text className={`text-sm mt-0.5 ${isSelected ? "text-brand-600" : "text-white/70"}`}>
                  {lang.englishName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <PrimaryButton onPress={handleContinue} className="bg-white">
          <Text className="text-brand-800 text-base font-semibold">{t("language.continue")}</Text>
        </PrimaryButton>
        <Text className="text-center text-brand-100 text-sm mt-4">{t("language.changeLater")}</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}
