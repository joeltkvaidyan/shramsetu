import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { api } from "../api/client";
import type { GrievanceCategory } from "../types";

const CATEGORIES: GrievanceCategory[] = [
  "unpaid_wages",
  "workplace_safety",
  "harassment_abuse",
  "illegal_termination",
  "document_issue",
  "employer_dispute",
  "insurance_claim",
  "accommodation",
  "other",
];

export default function GrievanceFormPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [category, setCategory] = useState<GrievanceCategory>("unpaid_wages");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/grievances", {
        category,
        subject,
        description,
        employer_name: employerName || undefined,
        incident_location: incidentLocation || undefined,
        incident_date: incidentDate
          ? new Date(incidentDate).toISOString()
          : undefined,
      });
      navigate(`/worker/grievances/${res.data.id}`, { replace: true });
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceSubject = (text: string) => {
    setSubject((prev) => (prev ? prev + " " + text : text));
  };

  const handleVoiceDescription = (text: string) => {
    setDescription((prev) => (prev ? prev + " " + text : text));
  };

  return (
    <Screen title={t("grievance.fileNew")} onBack={true}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-4 pb-10">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.category")}
          </label>
          <select
            className="input-field"
            value={category}
            onChange={(e) => setCategory(e.target.value as GrievanceCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`grievance.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.subject")}
          </label>
          <div className="flex items-center gap-2">
            <input
              required
              maxLength={200}
              className="input-field flex-1"
              placeholder={t("grievance.subjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <VoiceRecorder
              language={i18n.language}
              onTranscript={handleVoiceSubject}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.description")}
          </label>
          <textarea
            required
            rows={5}
            className="input-field resize-none"
            placeholder={t("grievance.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex justify-end mt-1">
            <VoiceRecorder
              language={i18n.language}
              onTranscript={handleVoiceDescription}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.employerNameOptional")}
          </label>
          <input
            className="input-field"
            value={employerName}
            onChange={(e) => setEmployerName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.incidentLocationOptional")}
          </label>
          <input
            className="input-field"
            value={incidentLocation}
            onChange={(e) => setIncidentLocation(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("grievance.incidentDateOptional")}
          </label>
          <input
            type="date"
            className="input-field"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary mt-2">
          {submitting ? t("grievance.submitting") : t("grievance.submit")}
        </button>
      </form>
    </Screen>
  );
}
