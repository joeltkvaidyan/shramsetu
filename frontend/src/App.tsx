import { Navigate, Route, Routes } from "react-router-dom";
import LanguageSelectPage from "./pages/LanguageSelectPage";
import StakeholderSelectPage from "./pages/StakeholderSelectPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import WorkerLoginPage from "./pages/WorkerLoginPage";
import WorkerRegisterPage from "./pages/WorkerRegisterPage";
import WorkerDashboardPage from "./pages/WorkerDashboardPage";
import DocumentWalletPage from "./pages/DocumentWalletPage";
import ChatbotPage from "./pages/ChatbotPage";
import SettingsPage from "./pages/SettingsPage";
import GrievanceListPage from "./pages/GrievanceListPage";
import GrievanceFormPage from "./pages/GrievanceFormPage";
import WageLogPage from "./pages/WageLogPage";
import { getGovToken } from "./api/client";
import GrievanceDetailPage from "./pages/GrievanceDetailPage";
import GovernmentLoginPage from "./pages/GovernmentLoginPage";
import NotificationInboxPage from "./pages/NotificationInboxPage";
import GovernmentDashboardPage from "./pages/GovernmentDashboardPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";

function GovernmentRoute({ children }: { children: React.ReactNode }) {
  const token = getGovToken();
  if (!token) return <Navigate to="/government/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
