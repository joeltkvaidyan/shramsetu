import { FormEvent, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { api } from "../api/client";
import { useAuth } from "../store/AuthContext";

type LoginMode = "password" | "otp";

export default function WorkerLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const [mode, setMode] = useState<LoginMode>("otp");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mobileRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Get values from refs as backup (in case React state didn't update on mobile)
    const mobile = mobileRef.current?.value || mobileNumber;
    const otpVal = otpRef.current?.value || otp;
    const passVal = passwordRef.current?.value || password;

    const sanitizedMobile = mobile.replace(/\D/g, "");

    if (!sanitizedMobile || sanitizedMobile.length < 10) {
      setError(t("auth.invalidMobile"));
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "otp") {
        const otpCode = otpVal || "123456";
        const res = await api.post("/auth/worker/otp-login", {
          mobile_number: sanitizedMobile,
          otp: otpCode,
        });
        loginWithToken(res.data.access_token, res.data.worker);
        navigate("/worker/dashboard");
      } else {
        if (!passVal) {
          setError(t("auth.enterPassword"));
          setSubmitting(false);
          return;
        }
        const res = await api.post("/auth/worker/login", {
          mobile_number: sanitizedMobile,
          password: passVal,
        });
        loginWithToken(res.data.access_token, res.data.worker);
        navigate("/worker/dashboard");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || t("auth.invalidCredentials");
      setError(typeof msg === "string" ? msg : t("auth.invalidCredentials"));
      console.error("Login error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t("auth.login")} onBack={true}>
      {/* Mode Toggle */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
        <button
          type="button"
          onClick={() => {
            setMode("otp");
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
            mode === "otp"
              ? "bg-brand-600 text-white shadow"
              : "text-gray-600 dark:text-gray-300"
          }`}
        >
          📱 {t("auth.otpLogin")}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
            mode === "password"
              ? "bg-brand-600 text-white shadow"
              : "text-gray-600 dark:text-gray-300"
          }`}
        >
          🔑 {t("auth.passwordLogin")}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mobile Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("auth.mobileNumber")}
          </label>
          <input
            ref={mobileRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel"
            required
            className="input-field"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="9876543210"
            maxLength={10}
          />
        </div>

        {/* OTP field */}
        {mode === "otp" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("auth.otpCode")}
            </label>
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              className="input-field"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder={t("auth.otpPlaceholder")}
              maxLength={6}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              💡 {t("auth.devModeHint", { code: "123456" })}
            </p>
          </div>
        )}

        {/* Password field */}
        {mode === "password" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("auth.password")}
            </label>
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t("auth.demoPassword", { password: "demo123" })}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <p className="text-red-600 text-sm">⚠️ {error}</p>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full">
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> {t("auth.loggingIn")}
            </span>
          ) : (
            t("auth.loginButton")
          )}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
        {t("auth.noAccount")}{" "}
        <button
          onClick={() => navigate("/worker/register")}
          className="text-brand-600 dark:text-brand-400 font-semibold"
        >
          {t("auth.createAccount")}
        </button>
      </p>
    </Screen>
  );
}
