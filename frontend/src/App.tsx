import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getGovToken } from "./api/client";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageFallback } from "./components/PageFallback";

// Every page is split into its own chunk. Statically importing all 16 made one
// 592 kB bundle that every visitor downloaded before seeing anything, including
// the government dashboard that most visitors never open. The language screen —
// the actual landing page — now costs only the shared vendor chunk.
const LanguageSelectPage = lazy(() => import("./pages/LanguageSelectPage"));
const StakeholderSelectPage = lazy(() => import("./pages/StakeholderSelectPage"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage"));
const WorkerLoginPage = lazy(() => import("./pages/WorkerLoginPage"));
const WorkerRegisterPage = lazy(() => import("./pages/WorkerRegisterPage"));
const WorkerDashboardPage = lazy(() => import("./pages/WorkerDashboardPage"));
const DocumentWalletPage = lazy(() => import("./pages/DocumentWalletPage"));
const ChatbotPage = lazy(() => import("./pages/ChatbotPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const GrievanceListPage = lazy(() => import("./pages/GrievanceListPage"));
const GrievanceFormPage = lazy(() => import("./pages/GrievanceFormPage"));
const GrievanceDetailPage = lazy(() => import("./pages/GrievanceDetailPage"));
const WageLogPage = lazy(() => import("./pages/WageLogPage"));
const GovernmentLoginPage = lazy(() => import("./pages/GovernmentLoginPage"));
const NotificationInboxPage = lazy(() => import("./pages/NotificationInboxPage"));
const GovernmentDashboardPage = lazy(() => import("./pages/GovernmentDashboardPage"));

function GovernmentRoute({ children }: { children: React.ReactNode }) {
  const token = getGovToken();
  if (!token) return <Navigate to="/government/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<PageFallback />}>
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LanguageSelectPage />} />
      <Route path="/language" element={<LanguageSelectPage />} />
      <Route path="/roles" element={<StakeholderSelectPage />} />
      <Route path="/roles/:role" element={<ComingSoonPage />} />

      {/* Worker routes */}
      <Route path="/worker/login" element={<WorkerLoginPage />} />
      <Route path="/worker/register" element={<WorkerRegisterPage />} />
      <Route
        path="/worker/dashboard"
        element={<ProtectedRoute><WorkerDashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/documents"
        element={<ProtectedRoute><DocumentWalletPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/chat"
        element={<ProtectedRoute><ChatbotPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/wages"
        element={<ProtectedRoute><WageLogPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/grievances"
        element={<ProtectedRoute><GrievanceListPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/grievances/new"
        element={<ProtectedRoute><GrievanceFormPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/grievances/:id"
        element={<ProtectedRoute><GrievanceDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/notifications"
        element={<ProtectedRoute><NotificationInboxPage /></ProtectedRoute>}
      />
      <Route
        path="/worker/settings"
        element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
      />

      {/* Government routes — completely separate */}
      <Route path="/government/login" element={<GovernmentLoginPage />} />
      <Route
        path="/government/dashboard"
        element={<GovernmentRoute><GovernmentDashboardPage /></GovernmentRoute>}
      />
      <Route
        path="/government/*"
        element={<Navigate to="/government/dashboard" replace />}
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
