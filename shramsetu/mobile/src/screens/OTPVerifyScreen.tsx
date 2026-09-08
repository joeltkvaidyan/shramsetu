import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { PrimaryButton } from "../components/Buttons";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";

const RESEND_COOLDOWN = 30;

export default function OTPVerifyScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { loginWithToken } = useAuth();

  const mobileNumber: string = route.params?.mobileNumber ?? "";
  const [otp, setOtp] = useState(route.params?.devOtp ?? "");
  const [devOtp] = useState<string | null>(route.params?.devOtp ?? null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async () => {
    setError(null);
    setVerifying(true);
    try {
      const res = await api.post("/auth/worker/otp/verify", { mobile_number: mobileNumber, otp });
      await loginWithToken(res.data.access_token, res.data.worker);
      // AuthContext now has a worker -> RootNavigator switches to the app tabs automatically.
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429) setError(t("otp.tooManyAttempts"));
      else setError(t("otp.invalidOtp"));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResending(true);
    try {
      await api.post("/auth/worker/otp/request", { mobile_number: mobileNumber });
      setCooldown(RESEND_COOLDOWN);
      setOtp("");
    } catch {
      setError(t("common.error"));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen title={t("otp.title")} showBack scroll={false}>
      <View className="mt-6">
        <Text className="text-gray-500 dark:text-gray-400 text-center mb-1">{t("otp.sentTo")}</Text>
        <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-6">
          {mobileNumber}
        </Text>

        {devOtp && (
          <View className="bg-amber-50 dark:bg-amber-900/30 rounded-xl px-4 py-3 mb-6">
            <Text className="text-xs text-amber-700 dark:text-amber-300">{t("otp.devOtpNotice")}</Text>
            <Text className="text-lg font-mono font-bold text-amber-800 dark:text-amber-200 mt-1">{devOtp}</Text>
          </View>
        )}

        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="------"
          className="text-center text-3xl tracking-[12px] font-bold rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-4 mb-4"
        />

        {error && <Text className="text-red-600 text-sm text-center mb-3">{error}</Text>}

        <PrimaryButton onPress={handleVerify} loading={verifying} disabled={otp.length !== 6}>
          {verifying ? t("otp.verifying") : t("otp.verify")}
        </PrimaryButton>

        <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} className="mt-5 items-center">
          <Text className={`text-sm font-semibold ${cooldown > 0 ? "text-gray-400" : "text-brand-600 dark:text-brand-400"}`}>
            {cooldown > 0
              ? t("otp.resendIn", { seconds: cooldown })
              : resending
              ? t("otp.resending")
              : t("otp.resend")}
          </Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}
