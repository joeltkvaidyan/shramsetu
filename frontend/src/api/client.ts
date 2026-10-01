import axios from "axios";
import i18n from "../i18n";

/**
 * Single source of truth for token storage. All read/write/delete access
 * goes through this module — pages and components must never call
 * localStorage for tokens directly.
 */
const TOKEN_KEY = "shramsetu.token";
const GOV_TOKEN_KEY = "gov_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getGovToken(): string | null {
  return localStorage.getItem(GOV_TOKEN_KEY);
}

export function setGovToken(token: string) {
  localStorage.setItem(GOV_TOKEN_KEY, token);
}

export function clearGovToken() {
  localStorage.removeItem(GOV_TOKEN_KEY);
}

export const api = axios.create({
  baseURL: "/api/v1",
});

/**
 * Normalize an error into a display-safe string.
 *
 * Handles FastAPI/Pydantic 422 array-shaped `detail` (rendering that raw
 * would white-screen React), maps 429 to a friendly localised message via
 * the i18n `errors.rateLimited` key, and network failures to
 * `errors.network`. Every error handler should go through this.
 */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const status = (err as any)?.response?.status;
  if (status === 429) {
    // Imported lazily to avoid a circular import with the i18n module.
    const translated = safeT("errors.rateLimited");
    if (translated) return translated;
  }
  if (!status && (err as any)?.code === "ERR_NETWORK") {
    const translated = safeT("errors.network");
    if (translated) return translated;
  }
  const detail = (err as any)?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return (
      detail
        .map((d: any) => {
          const where = Array.isArray(d?.loc)
            ? d.loc.filter((p: any) => p !== "body").join(".")
            : "";
          return where ? `${where}: ${d?.msg ?? "Invalid input"}` : d?.msg ?? "Invalid input";
        })
        .join("; ") || fallback
    );
  }
  if (typeof detail === "string" && detail) return detail;
  const msg = (err as any)?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** i18n lookup that survives i18n not being initialised yet (returns null). */
function safeT(key: string): string | null {
  try {
    const translated = i18n.t(key);
    return typeof translated === "string" && translated && translated !== key ? translated : null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      // Let the app-level auth context handle redirect on next render;
      // avoid a hard reload loop here.
    }
    return Promise.reject(error);
  }
);
