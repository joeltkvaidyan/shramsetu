import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { BottomNav } from "../components/BottomNav";
import { GrievanceStatusBadge } from "../components/GrievanceStatusBadge";
import { api } from "../api/client";
import type { Grievance } from "../types";

export default function GrievanceListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  useEffect(() => {
    const params: any = { limit: 100 };
    if (filterStatus) params.status = filterStatus;
    if (filterCategory) params.category = filterCategory;
    api
      .get<Grievance[]>("/grievances", { params })
      .then((res) => setGrievances(res.data))
      .finally(() => setLoading(false));
  }, [filterStatus, filterCategory]);

  return (
    <>
      <Screen title={t("grievance.title")}>
        <button onClick={() => navigate("/worker/grievances/new")} className="btn-primary mb-4">
          ＋ {t("grievance.fileNew")}
        </button>

        {/* Search and Filter */}
        <div className="mb-4 space-y-2">
          <input
            type="text"
            className="input-field"
            placeholder="🔍 Search complaints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="input-field flex-1 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="submitted">📥 Submitted</option>
              <option value="under_review">🔍 Under Review</option>
              <option value="resolved">✅ Resolved</option>
              <option value="rejected">❌ Rejected</option>
              <option value="withdrawn">🚫 Withdrawn</option>
              <option value="escalated">🚨 Escalated</option>
            </select>
            <select
              className="input-field flex-1 text-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="unpaid_wages">💰 Unpaid Wages</option>
              <option value="workplace_safety">⚠️ Safety</option>
              <option value="harassment_abuse">🛡️ Harassment</option>
              <option value="illegal_termination">🚫 Termination</option>
              <option value="document_issue">📄 Documents</option>
              <option value="employer_dispute">💼 Employer</option>
              <option value="insurance_claim">🏥 Insurance</option>
              <option value="accommodation">🏠 Housing</option>
              <option value="other">📋 Other</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-10">{t("common.loading")}</p>
        ) : grievances.length === 0 ? (
          <p className="text-gray-400 text-center py-10">{t("grievance.noComplaints")}</p>
        ) : (
          <div className="space-y-3 pb-10">
            {grievances
              .filter((g) => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (
                  g.subject.toLowerCase().includes(q) ||
                  g.complaint_number.toLowerCase().includes(q) ||
                  g.description?.toLowerCase().includes(q) ||
                  g.employer_name?.toLowerCase().includes(q)
                );
              })
              .map((g) => (
                <button
                  key={g.id}
                  onClick={() => navigate(`/worker/grievances/${g.id}`)}
                  className="card w-full text-left active:scale-[0.98] transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono text-gray-400">{g.complaint_number}</span>
                    <div className="flex gap-1">
                      {g.priority === 'urgent' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">🔴 Urgent</span>}
                      {g.priority === 'high' && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">🟠 High</span>}
                      {g.escalated && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded animate-pulse">🚨 Escalated</span>}
                      <GrievanceStatusBadge status={g.status} />
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{g.subject}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t(`grievance.categories.${g.category}`)} · {new Date(g.created_at).toLocaleDateString()}
                  </p>
                  {g.sla_deadline && (
                    <p className="text-xs text-gray-400 mt-1">
                      ⏰ Due: {new Date(g.sla_deadline).toLocaleDateString()}
                      {new Date(g.sla_deadline) < new Date() && g.status !== 'resolved' && (
                        <span className="text-red-500 font-semibold ml-1">(Overdue!)</span>
                      )}
                    </p>
                  )}
                </button>
              ))}
          </div>
        )}
      </Screen>
      <BottomNav />
    </>
  );
}
