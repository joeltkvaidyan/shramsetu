import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { BottomNav } from "../components/BottomNav";
import { api } from "../api/client";
import {
  cacheDocument,
  getCachedDocument,
  removeCachedDocument,
  clearAllCachedDocuments,
} from "../services/documentCache";
import {
  isPinSet,
  setPin,
  verifyPin,
  lockWallet,
  getLockoutRemaining,
} from "../services/documentSecurity";
import type { DocumentItem } from "../types";

export default function DocumentWalletPage() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security state
  const [pinSet, setPinSet] = useState(false);
  const [walletLocked, setWalletLocked] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [initializing, setInitializing] = useState(true);

  // Cache state
  const [cachedIds, setCachedIds] = useState<Set<number>>(new Set());
  const [caching, setCaching] = useState<number | null>(null);

  // Check PIN status on mount — wallet ALWAYS starts locked
  useEffect(() => {
    (async () => {
      try {
        const pinExists = await isPinSet();
        setPinSet(pinExists);
        setWalletLocked(true);
        lockWallet();
        updateCachedIds();
        updateLockoutTimer();
      } catch (err) {
        console.error("Failed to check PIN status:", err);
        // If PIN check fails, treat as no PIN set
        setPinSet(false);
        setWalletLocked(true);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const updateLockoutTimer = () => {
    const remaining = getLockoutRemaining();
    setLockoutRemaining(remaining);
    if (remaining > 0) {
      const timer = setInterval(() => {
        const r = getLockoutRemaining();
        setLockoutRemaining(r);
        if (r <= 0) clearInterval(timer);
      }, 1000);
      return () => clearInterval(timer);
    }
  };

  const updateCachedIds = async () => {
    try {
      const ids = await cacheIds();
      setCachedIds(new Set(ids));
    } catch {}
  };

  // ── PIN handlers ───────────────────────────────────────────────────
  const handleSetPin = async () => {
    setPinError(null);

    if (newPin.length < 4) {
      setPinError("PIN must be at least 4 digits");
      return;
    }
    if (newPin.length > 8) {
      setPinError("PIN must be at most 8 digits");
      return;
    }
    if (!/^\d+$/.test(newPin)) {
      setPinError("PIN must contain only numbers");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }

    try {
      await setPin(newPin);
      setPinSet(true);
      setShowPinSetup(false);
      setWalletLocked(false);
      setNewPin("");
      setConfirmPin("");
      setPinError(null);
    } catch (err: any) {
      setPinError(err.message);
    }
  };

  const handleVerifyPin = async () => {
    setPinError(null);

    if (pinInput.length < 4) {
      setPinError("Please enter at least 4 digits");
      return;
    }

    try {
      const valid = await verifyPin(pinInput);
      if (valid) {
        setWalletLocked(false);
        setPinInput("");
        setPinError(null);
      } else {
        setPinError("Incorrect PIN. Try again.");
        setPinInput("");
      }
    } catch (err: any) {
      setPinError(err.message);
      setPinInput("");
      updateLockoutTimer();
    }
  };

  const handleLock = () => {
    lockWallet();
    setWalletLocked(true);
    setPinInput("");
  };

  // ── Document handlers ──────────────────────────────────────────────
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.get<DocumentItem[]>("/documents", { params: { limit: 100 } });
      setDocuments(res.data);
    } catch {
      // Silently fail — user may be offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!walletLocked) loadDocuments();
  }, [walletLocked]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("display_name", file.name);
      await api.post("/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
      await loadDocuments();
    } catch {
      alert(t("common.error"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.display_name || `document-${doc.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download failed:", err);
      alert(t("common.error"));
    }
  };

  const handleCacheForOffline = async (doc: DocumentItem) => {
    setCaching(doc.id);
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      await cacheDocument(doc.id, doc.display_name, doc.content_type, doc.size_bytes, res.data);
      await updateCachedIds();
    } catch (err) {
      console.error("Cache failed:", err);
    } finally {
      setCaching(null);
    }
  };

  const handleRemoveFromCache = async (doc: DocumentItem) => {
    await removeCachedDocument(doc.id);
    await updateCachedIds();
  };

  const handleViewCached = async (doc: DocumentItem) => {
    const cached = await getCachedDocument(doc.id);
    if (!cached) return;
    const url = URL.createObjectURL(cached.blob);
    window.open(url, "_blank");
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (initializing) {
    return (
      <Screen title={t("documents.title")}>
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400 text-sm">⏳ {t("common.loading")}</div>
        </div>
      </Screen>
    );
  }

  // ── PIN Setup Screen ───────────────────────────────────────────────
  if (showPinSetup) {
    return (
      <Screen title="🔒 Set Document PIN" onBack={() => setShowPinSetup(false)}>
        <div className="space-y-4 mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Set a 4-8 digit PIN to protect your documents.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={8}
              className="input-field text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
              value={newPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setNewPin(val);
                setPinError(null);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={8}
              className="input-field text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setConfirmPin(val);
                setPinError(null);
              }}
            />
          </div>
          {newPin && confirmPin && newPin === confirmPin && (
            <p className="text-green-600 text-sm text-center">✅ PINs match</p>
          )}
          {newPin && confirmPin && newPin !== confirmPin && (
            <p className="text-red-500 text-sm text-center">❌ PINs do not match</p>
          )}
          {pinError && <p className="text-red-600 text-sm text-center">{pinError}</p>}
          <button
            onClick={handleSetPin}
            disabled={newPin.length < 4 || confirmPin.length < 4}
            className="btn-primary w-full disabled:opacity-40"
          >
            🔒 Set PIN
          </button>
        </div>
      </Screen>
    );
  }

  // ── Wallet Locked — always show this first ─────────────────────────
  if (walletLocked) {
    // No PIN set yet — force user to create one
    if (!pinSet) {
      return (
        <Screen title="🔒 Document Wallet">
          <div className="space-y-4 mt-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Set Up Document Security
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create a PIN to protect and access your documents
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 mx-auto max-w-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <p className="text-sm text-amber-800 dark:text-amber-200 text-left">
                  You must set a PIN before accessing documents for the first time.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPinSetup(true)}
              className="btn-primary w-full max-w-xs mx-auto"
            >
              🔒 Create PIN
            </button>
            <button
              onClick={() => (window.location.href = "/roles")}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ← Back to Role Selection
            </button>
          </div>
        </Screen>
      );
    }

    // PIN verification screen
    return (
      <Screen title="🔒 Document Wallet">
        <div className="space-y-4 mt-8 text-center">
          <div className="text-5xl mb-4">🔐</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Enter PIN to Access Documents
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your documents are protected with a PIN
          </p>
          <div className="max-w-xs mx-auto">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={8}
              className="input-field text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ""));
                setPinError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pinInput.length >= 4) {
                  handleVerifyPin();
                }
              }}
              autoFocus
            />
          </div>
          {pinError && (
            <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg p-2 mx-4">
              ⚠️ {pinError}
            </p>
          )}
          {lockoutRemaining > 0 && (
            <p className="text-amber-600 text-sm">
              ⏱️ Locked out for {Math.ceil(lockoutRemaining / 60)} more minutes
            </p>
          )}
          <button
            onClick={handleVerifyPin}
            disabled={pinInput.length < 4 || lockoutRemaining > 0}
            className="btn-primary w-full max-w-xs mx-auto disabled:opacity-40"
          >
            🔓 Unlock
          </button>
          <button
            onClick={() => {
              lockWallet();
              window.location.href = "/roles";
            }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Back to Role Selection
          </button>
        </div>
      </Screen>
    );
  }

  // ── Main Document Wallet ───────────────────────────────────────────
  return (
    <>
      <Screen title={t("documents.title")}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileSelected}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-primary mb-4"
        >
          {uploading ? t("documents.uploading") : `＋ ${t("documents.upload")}`}
        </button>

        {/* Lock & PIN buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={handleLock}
            className="flex-1 text-xs py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium"
          >
            🔒 Lock Wallet
          </button>
          <button
            onClick={() => setShowPinSetup(true)}
            className="flex-1 text-xs py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
          >
            🔑 Change PIN
          </button>
          <button
            onClick={async () => {
              if (window.confirm("Clear all offline documents?")) {
                await clearAllCachedDocuments();
                await updateCachedIds();
              }
            }}
            className="flex-1 text-xs py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
          >
            🗑️ Clear Cache
          </button>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
          {t("documents.myDocuments")}
        </h2>

        {loading ? (
          <p className="text-gray-400 text-center py-10">{t("common.loading")}</p>
        ) : documents.length === 0 ? (
          <p className="text-gray-400 text-center py-10">{t("documents.noDocuments")}</p>
        ) : (
          <div className="space-y-3 pb-10">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isCached={cachedIds.has(doc.id)}
                isCaching={caching === doc.id}
                onDownload={handleDownload}
                onCache={handleCacheForOffline}
                onRemoveCache={handleRemoveFromCache}
                onViewCached={handleViewCached}
                t={t}
              />
            ))}
          </div>
        )}
      </Screen>
      <BottomNav />
    </>
  );
}

// ── Document Card Component ──────────────────────────────────────────
function DocumentCard({
  doc,
  isCached,
  isCaching,
  onDownload,
  onCache,
  onRemoveCache,
  onViewCached,
  t,
}: {
  doc: DocumentItem;
  isCached: boolean;
  isCaching: boolean;
  onDownload: (doc: DocumentItem) => void;
  onCache: (doc: DocumentItem) => void;
  onRemoveCache: (doc: DocumentItem) => void;
  onViewCached: (doc: DocumentItem) => void;
  t: any;
}) {
  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{doc.content_type.includes("pdf") ? "📕" : "🖼️"}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.display_name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{(doc.size_bytes / 1024).toFixed(0)} KB</span>
            {isCached && (
              <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium">
                📥 Offline
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {isCached ? (
          <button
            onClick={() => onViewCached(doc)}
            className="flex-1 text-xs py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-medium"
          >
            📥 View Offline
          </button>
        ) : (
          <button
            onClick={() => onDownload(doc)}
            className="flex-1 text-xs py-2 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium"
          >
            {t("documents.view")}
          </button>
        )}

        {isCached ? (
          <button
            onClick={() => onRemoveCache(doc)}
            className="text-xs py-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
          >
            📤
          </button>
        ) : (
          <button
            onClick={() => onCache(doc)}
            disabled={isCaching}
            className="text-xs py-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium disabled:opacity-50"
          >
            {isCaching ? "⏳" : "📥"}
          </button>
        )}

        <button
          onClick={() => onDownload(doc)}
          className="text-xs py-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
        >
          ✏️
        </button>
        <button
          onClick={async () => {
            if (!window.confirm("Delete this document?")) return;
            await removeCached(doc.id);
            await api.delete(`/documents/${doc.id}`);
            window.location.reload();
          }}
          className="text-xs py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── Helper to get cached IDs (lazy import) ────────────────────────────
async function cacheIds(): Promise<number[]> {
  const { getCachedDocumentIds } = await import("../services/documentCache");
  return getCachedDocumentIds();
}

async function removeCached(id: number) {
  const { removeCachedDocument } = await import("../services/documentCache");
  return removeCachedDocument(id);
}
