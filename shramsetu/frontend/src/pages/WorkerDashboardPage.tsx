import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../store/AuthContext";
import { BottomNav } from "../components/BottomNav";

export default function WorkerDashboardPage() {
  const { t } = useTranslation();
  const { worker } = useAuth();
  const navigate = useNavigate();

  if (!worker) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-brand-700 text-white px-5 pt-8 pb-10 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center text-2xl overflow-hidden">
            {worker.profile_photo_path ? "👤" : "👤"}
          </div>
          <div>
            <p className="text-brand-100 text-sm">{t("dashboard.welcome")}</p>
            <h1 className="text-xl font-bold">{worker.full_name}</h1>
          </div>
        </div>
      </header>

      <main className="px-4 -mt-6">
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.yourWorkerId")}</p>
            <p className="text-lg font-mono font-bold text-brand-700 dark:text-brand-400">{worker.worker_id}</p>
          </div>
          {worker.qr_code && (
            <img src={worker.qr_code} alt="QR Code" className="w-16 h-16 rounded-lg border border-gray-200" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5">
          <DashboardTile
            icon="📄"
            label={t("dashboard.documentWallet")}
            onClick={() => navigate("/worker/documents")}
          />
          <DashboardTile
            icon="💬"
            label={t("dashboard.aiChatbot")}
            onClick={() => navigate("/worker/chat")}
            highlight
          />
          <DashboardTile
            icon="📢"
            label={t("grievance.title")}
            onClick={() => navigate("/worker/grievances")}
          />
          <DashboardTile icon="👤" label={t("dashboard.profile")} onClick={() => navigate("/worker/settings")} />
          <DashboardTile icon="⚙️" label={t("dashboard.settings")} onClick={() => navigate("/worker/settings")} />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function DashboardTile({
  icon,
  label,
  onClick,
  highlight,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`card flex flex-col items-center justify-center gap-2 py-6 active:scale-[0.97] transition ${
        highlight ? "ring-2 ring-brand-500" : ""
      }`}
    >
      <span className="text-3xl">{icon}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-center">{label}</span>
    </button>
  );
}
