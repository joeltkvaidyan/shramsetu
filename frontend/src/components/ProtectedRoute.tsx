import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../store/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { worker, loading, bootError, refreshMe } = useAuth();

  if (loading) {
    // Auth is still resolving (one quick /me round trip when a token exists).
    // Render nothing instead of the old full-screen "Loading…" display — the
    // guard is unchanged, only the waiting screen is gone.
    return null;
  }

  if (bootError && !worker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-900 px-6 text-center">
        <p className="text-gray-500 text-sm">{t("common.error")}</p>
        <button
          onClick={() => refreshMe()}
          className="text-sm font-semibold text-brand-600 dark:text-brand-400 underline"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!worker) {
    return <Navigate to="/worker/login" replace />;
  }

  return <>{children}</>;
}
