import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Sparkles,
  Megaphone,
  Settings,
  ChevronRight,
  Copy,
  Check,
  Clock,
  IndianRupee,
  Siren,
  CheckCircle2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../store/AuthContext";
import { BottomNav } from "../components/BottomNav";
import { Card, Badge, Avatar, SkeletonList } from "../components/ui";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { api } from "../api/client";
import type { Grievance } from "../types";

export default function WorkerDashboardPage() {
  const { t } = useTranslation();
  const { worker } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<Grievance[] | null>(null);

  // SOS raise — dashboard-delivery only; the modal must always say so.
  const [sosOpen, setSosOpen] = useState(false);
  const [sosLocation, setSosLocation] = useState("");
  const [sosNote, setSosNote] = useState("");
  const [sosSending, setSosSending] = useState(false);
  const [sosRaised, setSosRaised] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Grievance[]>("/grievances", { params: { limit: 3 } })
      .then((res) => active && setRecent(res.data))
      .catch(() => active && setRecent([]));
    return () => {
      active = false;
    };
  }, []);

  if (!worker) return null;

  const copyWorkerId = async () => {
    try {
      await navigator.clipboard.writeText(worker.worker_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — non-critical */
    }
  };

  const closeSos = () => {
    setSosOpen(false);
    setSosRaised(false);
    setSosError(null);
    setSosLocation("");
    setSosNote("");
  };

  const raiseSos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sosSending) return;
    setSosError(null);
    setSosSending(true);
    try {
      // Dashboard-only delivery — no SMS/phone call happens anywhere.
      await api.post("/sos", {
        location_text: sosLocation || undefined,
        note: sosNote || undefined,
      });
      setSosRaised(true);
    } catch {
      setSosError(t("sos.failed", "Could not raise the alert. Please try again."));
    } finally {
      setSosSending(false);
    }
  };

  const greetingKey =
    new Date().getHours() < 12 ? "dashboard.greetingMorning" : new Date().getHours() < 17 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-32">
      {/* Header — brand gradient with real avatar + greeting */}
      <header className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white px-5 pt-8 pb-12 rounded-b-[2rem] relative overflow-hidden animate-fade-in">
        {/* Subtle decorative glow */}
        <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-white/5 pointer-events-none animate-aurora-shift" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-10 w-48 h-48 rounded-full bg-emerald-300/10 blur-2xl pointer-events-none animate-float" aria-hidden="true" />
        <div className="flex items-center gap-4 relative">
          <Avatar name={worker.full_name} size="lg" className="ring-2 ring-white/30" />
          <div className="min-w-0">
            <p className="text-brand-100 text-sm">{t(greetingKey, "Welcome,")}</p>
            <h1 className="text-xl font-bold truncate">{worker.full_name}</h1>
          </div>
        </div>
      </header>

      <main className="px-4 -mt-8 relative">
        {/* Worker ID card — the product's "Aadhaar-lite" identity moment */}
        <Card className="!p-0 overflow-hidden animate-rise">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                {t("dashboard.yourWorkerId")}
              </p>
              <p className="text-lg font-mono font-bold text-brand-700 dark:text-brand-400">{worker.worker_id}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Digital ID QR — encodes the worker_id only. It is an offline
                  identity helper, not a verifiable credential. */}
              <span
                className="w-14 h-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-white p-0.5 inline-flex items-center justify-center shrink-0"
                title={t("dashboard.qrCode", "QR Code")}
              >
                <QRCodeSVG
                  value={worker.worker_id}
                  size={52}
                  level="M"
                  aria-label={t("dashboard.qrCode", "QR Code")}
                  role="img"
                />
              </span>
              <button
                onClick={copyWorkerId}
                className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition"
                aria-label={t("dashboard.copyWorkerId", "Copy worker ID")}
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </Card>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-3.5 mt-5">
          <ActionTile
            Icon={FileText}
            label={t("dashboard.documentWallet")}
            onClick={() => navigate("/worker/documents")}
            delay={60}
          />
          <ActionTile
            Icon={Sparkles}
            label={t("dashboard.aiChatbot")}
            onClick={() => navigate("/worker/chat")}
            featured
            delay={120}
          />
          <ActionTile
            Icon={Megaphone}
            label={t("grievance.title")}
            onClick={() => navigate("/worker/grievances")}
            delay={180}
          />
          <ActionTile
            Icon={IndianRupee}
            label={t("wages.title", "Wage Diary")}
            onClick={() => navigate("/worker/wages")}
            delay={240}
          />
          <ActionTile
            Icon={Settings}
            label={t("dashboard.settings")}
            onClick={() => navigate("/worker/settings")}
            delay={300}
          />
          <ActionTile
            Icon={Siren}
            label={t("sos.button", "SOS — Emergency help")}
            onClick={() => setSosOpen(true)}
            danger
            delay={360}
          />
        </div>

        {/* Recent grievances */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t("dashboard.recentGrievances", "Recent complaints")}
            </h2>
            <button
              onClick={() => navigate("/worker/grievances")}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-0.5"
            >
              {t("common.viewAll", "View all")}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recent === null ? (
            <SkeletonList rows={2} />
          ) : recent.length === 0 ? (
            <Card className="text-center py-6">
              <p className="text-sm text-gray-400">{t("grievance.empty", "No complaints yet")}</p>
              <button
                onClick={() => navigate("/worker/grievances/new")}
                className="text-sm font-semibold text-brand-600 dark:text-brand-400 mt-2"
              >
                + {t("grievance.fileNew", "File a complaint")}
              </button>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {recent.map((g) => (
                <Card
                  key={g.id}
                  interactive
                  onClick={() => navigate(`/worker/grievances/${g.id}`)}
                  className="!p-3.5 animate-rise"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{g.subject}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {g.created_at ? new Date(g.created_at).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <Badge tone="info" dot>
                      {t(`grievance.status.${g.status}`, g.status)}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* SOS modal — honest delivery notice (dashboard-only, no SMS). */}
      <Modal open={sosOpen} onClose={closeSos} title={t("sos.modalTitle", "Raise SOS alert")}>
        {sosRaised ? (
          <div role="status" className="text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" aria-hidden="true" />
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-3">
              {t("sos.raised", "Alert sent. Officials in your area will see it on their dashboard.")}
            </p>
            <Button className="mt-4" onClick={closeSos}>
              {t("common.back", "Back")}
            </Button>
          </div>
        ) : (
          <form onSubmit={raiseSos} className="space-y-4">
            <p
              role="alert"
              className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3"
            >
              {t("sos.notice", "Your alert will appear on government officials' dashboards in your area. This app does not send SMS or call anyone.")}
            </p>
            <div>
              <label htmlFor="sos-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("sos.locationLabel", "Where are you? (optional)")}
              </label>
              <input
                id="sos-location"
                className="input-field"
                maxLength={200}
                value={sosLocation}
                onChange={(e) => setSosLocation(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="sos-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("sos.noteLabel", "What happened? (optional)")}
              </label>
              <textarea
                id="sos-note"
                rows={3}
                maxLength={500}
                className="input-field resize-none"
                value={sosNote}
                onChange={(e) => setSosNote(e.target.value)}
              />
            </div>
            {sosError && (
              <p role="alert" className="field-error">
                {sosError}
              </p>
            )}
            <Button type="submit" variant="danger" loading={sosSending} className="w-full">
              {t("sos.confirm", "Raise alert now")}
            </Button>
          </form>
        )}
      </Modal>

      <BottomNav />
    </div>
  );
}

function ActionTile({
  Icon,
  label,
  onClick,
  featured = false,
  danger = false,
  delay = 0,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number | string }>;
  label: string;
  onClick: () => void;
  featured?: boolean;
  danger?: boolean;
  delay?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={`card !p-0 overflow-hidden text-left active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 animate-fade-up hover:shadow-card-hover ${
        danger
          ? "bg-gradient-to-br from-red-600 to-red-800 border-transparent text-white shadow-lg shadow-red-600/25"
          : featured
          ? "bg-gradient-to-br from-brand-600 to-brand-800 border-transparent text-white shadow-glow-brand"
          : ""
      }`}
    >
      <div className="flex flex-col gap-2.5 py-6 px-4 items-center justify-center">
        <span
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${
            featured || danger ? "bg-white/15" : "bg-brand-50 dark:bg-brand-900/30"
          }`}
        >
          <Icon
            className={`h-6 w-6 ${featured || danger ? "text-white" : "text-brand-600 dark:text-brand-400"}`}
            strokeWidth={1.9}
          />
        </span>
        <span
          className={`text-sm font-semibold text-center leading-snug ${
            featured || danger ? "text-white" : "text-gray-800 dark:text-gray-100"
          }`}
        >
          {label}
        </span>
      </div>
    </button>
  );
}
