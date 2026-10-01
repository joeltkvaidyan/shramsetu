/**
 * Government API client — handles auth, dashboard stats, workers, grievances,
 * notifications, and audit logs. Completely isolated from worker API client.
 *
 * Backend routes:
 *   /api/v1/auth/government/login   — POST login
 *   /api/v1/auth/government/me      — GET current user
 *   /api/v1/government/dashboard/stats — GET dashboard stats
 *   /api/v1/government/workers      — GET workers list
 *   /api/v1/government/grievances   — GET all grievances
 *   /api/v1/government/grievances/:id — GET detail
 *   /api/v1/government/grievances/:id/status — POST update status
 *   /api/v1/government/grievances/:id/comment — POST add comment
 *   /api/v1/government/notifications/send — POST send
 *   /api/v1/government/notifications     — GET list
 *   /api/v1/government/audit-logs        — GET (superadmin)
 */
import axios from "axios";

const API_BASE = "/api/v1";

// ── Helpers ──────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Government auth ──────────────────────────────────────────────────

export interface GovernmentUser {
  id: number;
  employee_id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  department: string;
  designation: string | null;
  state: string | null;
  district: string | null;
  is_superadmin: boolean;
  created_at: string;
}

export interface GovLoginResponse {
  access_token: string;
  government: GovernmentUser;
}

export async function govLogin(
  employee_id: string,
  password: string
): Promise<GovLoginResponse> {
  const { data } = await axios.post(
    `${API_BASE}/auth/government/login`,
    { employee_id, password }
  );
  return data;
}

export async function govGetMe(token: string): Promise<GovernmentUser> {
  const { data } = await axios.get(`${API_BASE}/auth/government/me`, {
    headers: authHeaders(token),
  });
  return data;
}

// ── Dashboard stats ──────────────────────────────────────────────────

export interface DashboardStats {
  total_workers: number;
  active_workers: number;
  total_grievances: number;
  open_grievances: number;
  resolved_grievances: number;
  urgent_grievances: number;
  grievances_by_category: Record<string, number>;
  grievances_by_status: Record<string, number>;
  recent_filings: Array<{
    id: number;
    complaint_number: string;
    category: string;
    subject: string;
    status: string;
    created_at: string | null;
  }>;
  workers_by_state: Record<string, number>;
}

export async function govGetStats(
  token: string
): Promise<DashboardStats> {
  const { data } = await axios.get(
    `${API_BASE}/government/dashboard/stats`,
    { headers: authHeaders(token) }
  );
  return data;
}

// ── Workers ──────────────────────────────────────────────────────────

export interface WorkerRecord {
  id: number;
  worker_id: string;
  full_name: string;
  occupation: string | null;
  current_state: string | null;
  current_district: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface WorkersResponse {
  total: number;
  workers: WorkerRecord[];
}

export async function govGetWorkers(
  token: string,
  search?: string
): Promise<WorkersResponse> {
  const params: Record<string, string> = {};
  if (search) params.search = search;
  const { data } = await axios.get(`${API_BASE}/government/workers`, {
    headers: authHeaders(token),
    params,
  });
  return data;
}

// ── Grievances ───────────────────────────────────────────────────────

export interface GovGrievance {
  id: number;
  complaint_number: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  employer_name: string | null;
  incident_location: string | null;
  incident_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
}

export interface GrievancesResponse {
  total: number;
  grievances: GovGrievance[];
}

export async function govGetGrievances(
  token: string,
  statusFilter?: string,
  category?: string
): Promise<GrievancesResponse> {
  const params: Record<string, string> = {};
  if (statusFilter) params.status_filter = statusFilter;
  if (category) params.category = category;
  const { data } = await axios.get(`${API_BASE}/government/grievances`, {
    headers: authHeaders(token),
    params,
  });
  return data;
}

export interface GovGrievanceDetail {
  id: number;
  complaint_number: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  employer_name: string | null;
  incident_location: string | null;
  incident_date: string | null;
  created_at: string | null;
  worker: {
    worker_id: string | null;
    full_name: string | null;
    occupation: string | null;
    current_state: string | null;
    current_district: string | null;
  };
  comments: Array<{
    id: number;
    author_name: string;
    author_role: string;
    content: string;
    is_internal: boolean;
    created_at: string | null;
  }>;
  timeline: Array<{
    status: string;
    note: string | null;
    changed_by: string;
    created_at: string | null;
  }>;
}

export async function govGetGrievanceDetail(
  token: string,
  grievanceId: number
): Promise<GovGrievanceDetail> {
  const { data } = await axios.get(
    `${API_BASE}/government/grievances/${grievanceId}`,
    { headers: authHeaders(token) }
  );
  return data;
}

export async function govUpdateGrievanceStatus(
  token: string,
  grievanceId: number,
  newStatus: string,
  note?: string
): Promise<{ detail: string; old_status: string; new_status: string }> {
  const { data } = await axios.post(
    `${API_BASE}/government/grievances/${grievanceId}/status`,
    { status: newStatus, note },
    { headers: authHeaders(token) }
  );
  return data;
}

export async function govAddComment(
  token: string,
  grievanceId: number,
  content: string,
  isInternal: boolean = false
) {
  const { data } = await axios.post(
    `${API_BASE}/government/grievances/${grievanceId}/comment`,
    { content, is_internal: isInternal },
    { headers: authHeaders(token) }
  );
  return data;
}

// ── Notifications ────────────────────────────────────────────────────

export interface GovNotification {
  id: number;
  title: string;
  body: string;
  priority: string;
  target: string;
  target_value: string | null;
  sender_name: string;
  department: string;
  is_broadcast: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: GovNotification[];
}

export async function govSendNotification(
  token: string,
  payload: {
    title: string;
    body: string;
    priority?: string;
    target?: string;
    target_value?: string;
    is_broadcast?: boolean;
  }
): Promise<{ detail: string; notification_id: number; sent_count: number }> {
  const { data } = await axios.post(
    `${API_BASE}/government/notifications/send`,
    payload,
    { headers: authHeaders(token) }
  );
  return data;
}

export async function govGetNotifications(
  token: string
): Promise<NotificationsResponse> {
  const { data } = await axios.get(`${API_BASE}/government/notifications`, {
    headers: authHeaders(token),
  });
  return data;
}

// ── Audit Logs (superadmin only) ────────────────────────────────────

export interface AuditLog {
  id: number;
  timestamp: string;
  actor_role: string;
  actor_identifier: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  success: boolean;
  failure_reason: string | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
}

export async function govGetAuditLogs(
  token: string
): Promise<AuditLogsResponse> {
  const { data } = await axios.get(
    `${API_BASE}/government/audit-logs`,
    { headers: authHeaders(token) }
  );
  return data;
}
