import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";

const ROLES = [
  { key: "worker", icon: "👷", path: "/worker/login" },
  { key: "employer", icon: "🏢", path: "/roles/employer" },
  { key: "government", icon: "🏛️", path: "/government/dashboard" },
  { key: "insurance", icon: "🛡️", path: "/roles/insurance" },
] as const;

export default function StakeholderSelectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Screen onBack={() => navigate("/")}>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
        {t("role.select")}
      </h1>
      <div className="grid grid-cols-1 gap-4">
        {ROLES.map((role) => (
          <button
            key={role.key}
            onClick={() => navigate(role.path)}
            className="card flex items-center gap-4 py-5 active:scale-[0.98] transition text-left"
          >
            <span className="text-3xl">{role.icon}</span>
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t(`role.${role.key}`)}
            </span>
            <span className="ml-auto text-gray-400 text-xl">›</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
