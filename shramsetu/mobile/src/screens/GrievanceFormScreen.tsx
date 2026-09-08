import { useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { FormField } from "../components/FormField";
import { ChipSelect } from "../components/ChipSelect";
import { PrimaryButton } from "../components/Buttons";
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

export default function GrievanceFormScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [category, setCategory] = useState<GrievanceCategory>("unpaid_wages");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: t(`grievance.categories.${c}`) }));

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      setError(t("common.required"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/grievances", {
        category,
        subject,
        description,
        employer_name: employerName || undefined,
        incident_location: incidentLocation || undefined,
        incident_date: incidentDate ? new Date(incidentDate).toISOString() : undefined,
      });
      navigation.replace("GrievanceDetail", { id: res.data.id });
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t("grievance.fileNew")} showBack>
      <View className="mt-2">
        <ChipSelect label={t("grievance.category")} options={categoryOptions} value={category} onChange={(v) => setCategory(v as GrievanceCategory)} />

        <FormField
          label={t("grievance.subject")}
          placeholder={t("grievance.subjectPlaceholder")}
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />
        <FormField
          label={t("grievance.description")}
          placeholder={t("grievance.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={{ minHeight: 110 }}
        />
        <FormField label={t("grievance.employerNameOptional")} value={employerName} onChangeText={setEmployerName} />
        <FormField label={t("grievance.incidentLocationOptional")} value={incidentLocation} onChangeText={setIncidentLocation} />
        <FormField label={t("grievance.incidentDateOptional")} placeholder="YYYY-MM-DD" value={incidentDate} onChangeText={setIncidentDate} />

        {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

        <PrimaryButton onPress={handleSubmit} loading={submitting} className="mt-2">
          {submitting ? t("grievance.submitting") : t("grievance.submit")}
        </PrimaryButton>
      </View>
    </Screen>
  );
}
