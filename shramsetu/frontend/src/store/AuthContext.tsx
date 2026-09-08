import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "../api/client";
import type { Worker } from "../types";

interface AuthContextValue {
  worker: Worker | null;
  loading: boolean;
  loginWithToken: (token: string, worker: Worker) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setWorker(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<Worker>("/auth/worker/me");
      setWorker(res.data);
    } catch {
      clearToken();
      setWorker(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const loginWithToken = (token: string, w: Worker) => {
    setToken(token);
    setWorker(w);
  };

  const logout = () => {
    clearToken();
    setWorker(null);
  };

  return (
    <AuthContext.Provider value={{ worker, loading, loginWithToken, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
