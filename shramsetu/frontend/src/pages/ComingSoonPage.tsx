import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";

export default function ComingSoonPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useParams<{ role: string }>();

  const icons: Record<string, string> = {
    employer: "🏢",
    government: "🏛️",
    insurance: "🛡️",
  };

  return (
    <Screen onBack={() => navigate("/roles")}>
      <div className="flex flex-col items-center justify-center text-center mt-16">
        <div className="w-24 h-24 rounded-3xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-5xl mb-6">
          {icons[role ?? ""] ?? "🚧"}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {role && t(`role.${role}`)}
        </h1>
        <h2 className="text-xl font-semibold text-brand-600 dark:text-brand-400 mb-3">
          {t("role.comingSoonTitle")}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs">{t("role.comingSoonDesc")}</p>

        <button onClick={() => navigate("/roles")} className="btn-secondary mt-10">
          {t("role.backToRoles")}
        </button>
      </div>
    </Screen>
  );
}
