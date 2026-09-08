import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { FormField } from "../components/FormField";
import { PrimaryButton } from "../components/Buttons";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";

export default function WorkerLoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { loginWithToken } = useAuth();

  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/auth/worker/login", { mobile_number: mobileNumber, password });
      await loginWithToken(res.data.access_token, res.data.worker);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setError(t("auth.phoneNotVerified"));
      } else {
        setError(t("auth.invalidCredentials"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t("auth.login")} showBack>
      <View className="mt-4">
        <FormField
          label={t("auth.mobileNumber")}
          keyboardType="phone-pad"
          value={mobileNumber}
          onChangeText={setMobileNumber}
          placeholder="9876543210"
        />
        <FormField
          label={t("auth.password")}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

        <PrimaryButton onPress={handleSubmit} loading={submitting} disabled={!mobileNumber || !password}>
          {submitting ? t("auth.loggingIn") : t("auth.loginButton")}
        </PrimaryButton>

        <View className="flex-row justify-center mt-6">
          <Text className="text-sm text-gray-500 dark:text-gray-400">{t("auth.noAccount")} </Text>
          <TouchableOpacity onPress={() => navigation.navigate("WorkerRegister")}>
            <Text className="text-sm text-brand-600 dark:text-brand-400 font-semibold">
              {t("auth.createAccount")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}
