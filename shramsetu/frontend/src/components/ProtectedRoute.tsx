import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "../store/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { worker, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!worker) {
    return <Navigate to="/worker/login" replace />;
  }

  return <>{children}</>;
}
