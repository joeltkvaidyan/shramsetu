/**
 * Multi-Document Upload Component
 * Supports drag-and-drop, multiple file selection, categories, and preview
 */
import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cacheDocument } from "../services/offlineStorage";
import { useAuth } from "../store/AuthContext";

interface DocumentFile {
  id: string;
  file: File;
  name: string;
  category: string;
  preview?: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

interface MultiDocumentUploadProps {
  onUploadComplete?: (documents: any[]) => void;
}

const DOCUMENT_CATEGORIES = [
  { id: "identity", label: "Identity Documents", icon: "\u{1FAAA}" },
  { id: "income", label: "Income Proof", icon: "\u{1F4B0}" },
  { id: "health", label: "Health Documents", icon: "\u{1F3E5}" },
  { id: "employment", label: "Employment", icon: "\u{1F4BC}" },
  { id: "education", label: "Education", icon: "\u{1F4DA}" },
  { id: "other", label: "Other", icon: "\u{1F4C4}" },
];

export function MultiDocumentUpload({ onUploadComplete }: MultiDocumentUploadProps) {
  const { t } = useTranslation();
  const { worker } = useAuth();
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newDocs: DocumentFile[] = [];
    for (const file of Array.from(files)) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) continue;
      if (file.size > 15 * 1024 * 1024) continue;
      const doc: DocumentFile = {
        id: generateId(),
        file,
        name: file.name,
        category: "other",
        uploading: false,
        progress: 0,
      };
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, preview: e.target?.result as string } : d))
          );
        };
        reader.readAsDataURL(file);
      }
      newDocs.push(doc);
    }
    setDocuments((prev) => [...prev, ...newDocs]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
    },
    [handleFiles]
  );

  const updateCategory = (docId: string, category: string) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, category } : doc)));
  };

  const removeDocument = (docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const uploadDocuments = async () => {
    const uploadedDocs: any[] = [];
    for (const doc of documents) {
      if (doc.uploading) continue;
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, uploading: true, progress: 0 } : d))
      );
      try {
        const formData = new FormData();
        formData.append("file", doc.file);
        formData.append("name", doc.name);
        formData.append("category", doc.category);
        const progressInterval = setInterval(() => {
          setDocuments((prev) =>
            prev.map((d) => (d.id === doc.id ? { ...d, progress: Math.min(d.progress + 10, 90) } : d))
          );
        }, 200);
        const response = await fetch("/api/v1/documents/upload", {
          method: "POST",
          body: formData,
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        clearInterval(progressInterval);
        if (!response.ok) throw new Error("Upload failed");
        const result = await response.json();
        if (worker?.id) {
          const arrayBuffer = await doc.file.arrayBuffer();
          await cacheDocument(worker.id, {
            id: result.id,
            name: doc.name,
            category: doc.category,
            mimeType: doc.file.type,
            data: arrayBuffer,
          });
        }
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, uploading: false, progress: 100 } : d))
        );
        uploadedDocs.push(result);
      } catch (error: any) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, uploading: false, error: error.message || "Upload failed" } : d
          )
        );
      }
    }
    if (onUploadComplete) onUploadComplete(uploadedDocs);
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]"
            : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:scale-[1.01]"
        }`}
      >
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" onChange={handleFileInput} className="hidden" />
        <div className="space-y-4">
          <div className="text-4xl">{isDragging ? "\u{1F4E5}" : "\u{1F4C4}"}</div>
          <div>
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
              {isDragging ? t("Drop files here") : t("Drag & drop files here")}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t("or click to browse")} \u2022 {t("PDF, JPG, PNG up to 15MB")}
            </p>
          </div>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="space-y-4 animate-fadeIn">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            {t("Selected Documents")} ({documents.length})
          </h3>
          {documents.map((doc) => (
            <div key={doc.id} className="card p-4 animate-slideIn">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  {doc.preview ? (
                    <img src={doc.preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      {"\u{1F4C4}"}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{doc.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {(doc.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <select
                    value={doc.category}
                    onChange={(e) => updateCategory(doc.id, e.target.value)}
                    className="mt-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700"
                  >
                    {DOCUMENT_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                  {doc.uploading && (
                    <div className="mt-2">
                      <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-200"
                          style={{ width: `${doc.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{doc.progress}%</p>
                    </div>
                  )}
                  {doc.error && <p className="text-sm text-red-500 mt-1">{doc.error}</p>}
                </div>
                <button onClick={() => removeDocument(doc.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={uploadDocuments}
            disabled={documents.some((d) => d.uploading)}
            className="btn-primary w-full transition-all duration-300 active:scale-[0.98]"
          >
            {documents.some((d) => d.uploading) ? t("Uploading...") : t("Upload All Documents")}
          </button>
        </div>
      )}
    </div>
  );
}
