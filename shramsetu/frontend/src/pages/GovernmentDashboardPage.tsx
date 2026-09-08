import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  govGetStats,
  govGetWorkers,
  govGetGrievances,
  govUpdateGrievanceStatus,
  govSendNotification,
  govGetNotifications,
  govGetAuditLogs,
  type DashboardStats,
  type WorkerRecord,
  type GovGrievance,
  type GovNotification,
  type AuditLog,
} from "../api/governmentClient";

type Tab = "overview" | "grievances" | "workers" | "notifications" | "audit";

export default function GovernmentDashboardPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("gov_token");
  const govUser = JSON.parse(localStorage.getItem("gov_user") || "{}");

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [grievances, setGrievances] = useState<GovGrievance[]>([]);
  const [notifications, setNotifications] = useState<GovNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [grievanceStatusFilter, setGrievanceStatusFilter] = useState("");
  const [grievanceCategoryFilter, setGrievanceCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Notification form
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifPriority, setNotifPriority] = useState("medium");
  const [notifTarget, setNotifTarget] = useState("all");
  const [notifSending, setNotifSending] = useState(false);
  const [notifSent, setNotifSent] = useState(false);
  const [notifResult, setNotifResult] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/government/login");
      return;
    }
    loadTabData();
  }, [activeTab, token]);

  const loadTabData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (activeTab === "overview") {
        setStats(await govGetStats(token));
      } else if (activeTab === "workers") {
        const res = await govGetWorkers(token, searchQuery || undefined);
        setWorkers(res.workers || []);
      } else if (activeTab === "grievances") {
        const res = await govGetGrievances(
          token,
          grievanceStatusFilter || undefined,
          grievanceCategoryFilter || undefined
        );
        setGrievances(res.grievances || []);
      } else if (activeTab === "notifications") {
        const res = await govGetNotifications(token);
        setNotifications(res.notifications || []);
      } else if (activeTab === "audit") {
        const res = await govGetAuditLogs(token);
        setAuditLogs(res.logs || []);
      }
    } catch (err: any) {
      console.error("Failed to load:", err);
      if (err?.response?.status === 401) {
        localStorage.removeItem("gov_token");
        localStorage.removeItem("gov_user");
        navigate("/government/login");
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, token, searchQuery, grievanceStatusFilter, grievanceCategoryFilter]);

  const handleUpdateGrievanceStatus = async (id: number, newStatus: string) => {
    if (!token) return;
    try {
      await govUpdateGrievanceStatus(token, id, newStatus);
      loadTabData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !notifTitle || !notifMessage) return;
    setNotifSending(true);
    try {
      const result = await govSendNotification(token, {
        title: notifTitle,
        body: notifMessage,
        priority: notifPriority,
        target: notifTarget,
      });
      setNotifTitle("");
      setNotifMessage("");
      setNotifResult(result.detail);
      setNotifSent(true);
      setTimeout(() => setNotifSent(false), 5000);
      loadTabData();
    } catch (err) {
      console.error(err);
    } finally {
      setNotifSending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gov_token");
    localStorage.removeItem("gov_user");
    navigate("/government/login");
  };

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "overview", icon: "📊", label: "Overview" },
    { key: "grievances", icon: "📢", label: "Grievances" },
    { key: "workers", icon: "👷", label: "Workers" },
    { key: "notifications", icon: "🔔", label: "Notifications" },
    { key: "audit", icon: "📋", label: "Audit Logs" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-xl">🛡️</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">ShramSetu Government Portal</h1>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>{govUser.is_superadmin ? "Super Admin" : govUser.department || "Official"}</span>
                <span>•</span>
                <span>{govUser.employee_id}</span>
                {govUser.state && (
                  <>
                    <span>•</span>
                    <span>{govUser.state}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-slate-800"
            title="Sign out"
          >
            🚪 Sign Out
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-slate-900/50 border-b border-slate-800 overflow-x-auto">
        <div className="flex gap-1 max-w-7xl mx-auto px-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {/* ── Overview Tab ──────────────────────────────────── */}
        {!loading && activeTab === "overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon="👷" label="Total Workers" value={stats.total_workers} color="blue" />
              <StatCard icon="✅" label="Active Workers" value={stats.active_workers} color="green" />
              <StatCard icon="📢" label="Open Grievances" value={stats.open_grievances} color="amber" />
              <StatCard icon="🏁" label="Resolved" value={stats.resolved_grievances} color="emerald" />
            </div>

            {/* Grievances by Category */}
            {stats.grievances_by_category && Object.keys(stats.grievances_by_category).length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="font-bold mb-4">📊 Grievances by Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(stats.grievances_by_category).map(([cat, count]) => (
                    <div key={cat} className="bg-slate-900/50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-blue-400">{count}</p>
                      <p className="text-slate-400 text-sm capitalize">{cat.replace(/_/g, " ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workers by State */}
            {stats.workers_by_state && Object.keys(stats.workers_by_state).length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="font-bold mb-4">🗺️ Workers by State</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(stats.workers_by_state).map(([state, count]) => (
                    <div key={state} className="bg-slate-900/50 rounded-xl p-3">
                      <p className="text-2xl font-bold text-emerald-400">{count}</p>
                      <p className="text-slate-400 text-sm">{state}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Filings */}
            {stats.recent_filings && stats.recent_filings.length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="font-bold mb-4">📋 Recent Grievance Filings</h3>
                <div className="space-y-2">
                  {stats.recent_filings.map((f) => (
                    <div key={f.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg p-3">
                      <div>
                        <span className="font-mono text-blue-400 text-sm">{f.complaint_number}</span>
                        <span className="mx-2 text-slate-600">•</span>
                        <span className="text-white text-sm">{f.subject}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        f.status === "submitted" ? "bg-blue-500/20 text-blue-400" :
                        f.status === "under_review" ? "bg-amber-500/20 text-amber-400" :
                        f.status === "resolved" ? "bg-green-500/20 text-green-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {f.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Workers Tab ───────────────────────────────────── */}
        {!loading && activeTab === "workers" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search workers by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadTabData()}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={loadTabData}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl font-medium transition"
              >
                🔍 Search
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="text-left py-3 px-3">Worker ID</th>
                    <th className="text-left py-3 px-3">Name</th>
                    <th className="text-left py-3 px-3">Occupation</th>
                    <th className="text-left py-3 px-3">State</th>
                    <th className="text-left py-3 px-3">District</th>
                    <th className="text-left py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={w.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 font-mono text-blue-400">{w.worker_id}</td>
                      <td className="py-3 px-3">{w.full_name}</td>
                      <td className="py-3 px-3 text-slate-300">{w.occupation || "-"}</td>
                      <td className="py-3 px-3 text-slate-300">{w.current_state || "-"}</td>
                      <td className="py-3 px-3 text-slate-300">{w.current_district || "-"}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          w.is_active ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"
                        }`}>
                          {w.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {workers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">No workers found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Grievances Tab ────────────────────────────────── */}
        {!loading && activeTab === "grievances" && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <select
                value={grievanceStatusFilter}
                onChange={(e) => setGrievanceStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                value={grievanceCategoryFilter}
                onChange={(e) => setGrievanceCategoryFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                <option value="unpaid_wages">Unpaid Wages</option>
                <option value="workplace_safety">Workplace Safety</option>
                <option value="harassment_abuse">Harassment</option>
                <option value="illegal_termination">Illegal Termination</option>
                <option value="document_issue">Document Issue</option>
                <option value="employer_dispute">Employer Dispute</option>
                <option value="insurance_claim">Insurance Claim</option>
                <option value="accommodation">Accommodation</option>
                <option value="other">Other</option>
              </select>
              <button
                onClick={loadTabData}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl font-medium transition"
              >
                Apply Filters
              </button>
            </div>
            {grievances.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No grievances found</p>
            ) : (
              <div className="space-y-3">
                {grievances.map((g) => (
                  <div key={g.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            g.status === "submitted" ? "bg-blue-500/20 text-blue-400" :
                            g.status === "under_review" ? "bg-amber-500/20 text-amber-400" :
                            g.status === "resolved" ? "bg-green-500/20 text-green-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>
                            {g.status.replace(/_/g, " ")}
                          </span>
                          <span className="font-mono text-slate-500 text-xs">{g.complaint_number || `#${g.id}`}</span>
                          <span className="text-slate-600 text-xs">• {g.category?.replace(/_/g, " ")}</span>
                        </div>
                        <h3 className="font-medium text-white">{g.subject}</h3>
                        <p className="text-slate-400 text-sm mt-1 line-clamp-2">{g.description}</p>
                        {g.employer_name && (
                          <p className="text-slate-500 text-xs mt-1">Employer: {g.employer_name}</p>
                        )}
                        <p className="text-slate-500 text-xs mt-1">
                          Filed: {g.created_at ? new Date(g.created_at).toLocaleDateString() : "-"}
                        </p>
                      </div>
                      <div className="ml-4 flex flex-col gap-2">
                        {g.status === "submitted" && (
                          <button
                            onClick={() => handleUpdateGrievanceStatus(g.id, "under_review")}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1.5 rounded-lg transition"
                          >
                            Review
                          </button>
                        )}
                        {g.status === "under_review" && (
                          <button
                            onClick={() => handleUpdateGrievanceStatus(g.id, "resolved")}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg transition"
                          >
                            Resolve
                          </button>
                        )}
                        {g.status === "submitted" && (
                          <button
                            onClick={() => handleUpdateGrievanceStatus(g.id, "rejected")}
                            className="bg-red-600/50 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded-lg transition"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Notifications Tab ──────────────────────────────── */}
        {!loading && activeTab === "notifications" && (
          <div className="space-y-6">
            {/* Send Form */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                📤 Send Push Notification to Workers
              </h2>
              {notifSent && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-300 text-sm mb-4">
                  ✅ {notifResult || "Notification sent successfully!"}
                </div>
              )}
              <form onSubmit={handleSendNotification} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="e.g. Important Labour Policy Update"
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Message</label>
                  <textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Detailed notification message for workers..."
                    required
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Priority</label>
                    <select
                      value={notifPriority}
                      onChange={(e) => setNotifPriority(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🟠 High</option>
                      <option value="urgent">🔴 Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Target</label>
                    <select
                      value={notifTarget}
                      onChange={(e) => setNotifTarget(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Workers</option>
                      <option value="by_state">By State</option>
                      <option value="by_district">By District</option>
                      <option value="by_occupation">By Occupation</option>
                      <option value="specific_workers">Specific Workers</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={notifSending || !notifTitle || !notifMessage}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition disabled:opacity-50 active:scale-[0.98]"
                >
                  {notifSending ? "Sending..." : "📤 Send Notification"}
                </button>
              </form>
            </div>

            {/* Sent Notifications */}
            <div>
              <h3 className="text-lg font-bold mb-3">📋 Sent Notifications</h3>
              {notifications.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No notifications sent yet</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div key={n.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{n.title}</h4>
                          <p className="text-slate-400 text-sm mt-1">{n.body}</p>
                          <p className="text-slate-500 text-xs mt-2">
                            By {n.sender_name} ({n.department}) •{" "}
                            {n.created_at ? new Date(n.created_at).toLocaleString() : "-"} • Target: {n.target}
                            {n.target_value && ` (${n.target_value})`}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          n.priority === "urgent" ? "bg-red-500/20 text-red-400" :
                          n.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                          n.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-green-500/20 text-green-400"
                        }`}>
                          {n.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Audit Logs Tab ─────────────────────────────────── */}
        {!loading && activeTab === "audit" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">🔒 Audit Logs (Superadmin Only)</h2>
            {auditLogs.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No audit logs found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-left py-3 px-3">Time</th>
                      <th className="text-left py-3 px-3">Actor</th>
                      <th className="text-left py-3 px-3">Action</th>
                      <th className="text-left py-3 px-3">Resource</th>
                      <th className="text-left py-3 px-3">IP</th>
                      <th className="text-left py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="py-3 px-3 text-slate-300">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}
                        </td>
                        <td className="py-3 px-3 font-mono text-blue-400">{log.actor_identifier}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">{log.action}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{log.resource_type || "-"} #{log.resource_id || "-"}</td>
                        <td className="py-3 px-3 text-slate-500 font-mono text-xs">{log.ip_address || "-"}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            log.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}>
                            {log.success ? "OK" : "FAILED"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
    green: "from-green-500/20 to-green-600/10 border-green-500/30",
    amber: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
    emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-slate-400 text-sm mt-1">{label}</p>
    </div>
  );
}
