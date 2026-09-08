import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/Screen";
import { GrievanceStatusBadge } from "../components/GrievanceStatusBadge";
import { api } from "../api/client";
import type { GrievanceDetail } from "../types";

export default function GrievanceDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [grievance, setGrievance] = useState<GrievanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<GrievanceDetail>(`/grievances/${id}`);
      setGrievance(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/grievances/${id}/attachments`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await load();
    } catch {
      alert(t("common.error"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    await api.delete(`/grievances/${id}/attachments/${attachmentId}`);
    load();
  };

  const handleWithdraw = async () => {
    if (!window.confirm(t("grievance.withdrawConfirm"))) return;
    setWithdrawing(true);
    try {
      await api.post(`/grievances/${id}/withdraw`, {});
      await load();
    } finally {
      setWithdrawing(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await api.post(`/grievances/${id}/comments`, { content: commentText });
      setCommentText("");
      await load();
    } catch {
      alert(t("common.error"));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (feedbackRating === 0) return;
    setSubmittingFeedback(true);
    try {
      await api.post(`/grievances/${id}/feedback`, {
        rating: feedbackRating,
        feedback: feedbackText || undefined,
      });
      setShowFeedback(false);
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.detail || t("common.error"));
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading || !grievance) {
    return (
      <Screen onBack={true}>
        <p className="text-gray-400 text-center py-10">{t("common.loading")}</p>
      </Screen>
    );
  }

  const canModify = !["withdrawn", "resolved", "rejected"].includes(grievance.status);

  return (
    <Screen title={grievance.complaint_number} onBack={() => navigate("/worker/grievances")}>
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{grievance.subject}</h1>
          <GrievanceStatusBadge status={grievance.status} />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{grievance.description}</p>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>
            <span className="font-semibold">{t("grievance.category")}:</span>{" "}
            {t(`grievance.categories.${grievance.category}`)}
          </p>
          {grievance.employer_name && (
            <p>
              <span className="font-semibold">{t("grievance.employerName")}:</span> {grievance.employer_name}
            </p>
          )}
          {grievance.incident_location && (
            <p>
              <span className="font-semibold">{t("grievance.incidentLocation")}:</span>{" "}
              {grievance.incident_location}
            </p>
          )}
          {grievance.incident_date && (
            <p>
              <span className="font-semibold">{t("grievance.incidentDate")}:</span>{" "}
              {new Date(grievance.incident_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {t("grievance.attachments")}
      </h2>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAttach} />
      <div className="space-y-2 mb-4">
        {grievance.attachments.length === 0 ? (
          <p className="text-gray-400 text-sm">{t("grievance.noAttachments")}</p>
        ) : (
          grievance.attachments.map((att) => (
            <div key={att.id} className="card flex items-center gap-3 py-3">
              <span className="text-xl">{att.content_type.includes("pdf") ? "📕" : "🖼️"}</span>
              <a
                href={`/api/v1/grievances/${id}/attachments/${att.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-sm text-brand-700 dark:text-brand-400 truncate font-medium"
              >
                {att.original_filename}
              </a>
              {canModify && (
                <button
                  onClick={() => handleDeleteAttachment(att.id)}
                  className="text-red-500 text-xs font-semibold shrink-0"
                >
                  {t("documents.delete")}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {canModify && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || grievance.attachments.length >= 5}
          className="btn-secondary mb-6 text-sm !py-3"
        >
          {uploading ? t("documents.uploading") : `＋ ${t("grievance.addAttachment")}`}
        </button>
      )}

      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {t("grievance.timeline")}
      </h2>
      <div className="relative pl-4 border-l-2 border-gray-200 dark:border-gray-700 mb-8 space-y-4">
        {grievance.timeline.map((item, i) => (
          <div key={i} className="relative">
            <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-brand-500" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t(`grievance.status.${item.status}`, item.status)}
            </p>
            {item.note && <p className="text-xs text-gray-500 dark:text-gray-400">{item.note}</p>}
            <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {canModify && (
        <button
          onClick={handleWithdraw}
          disabled={withdrawing}
          className="w-full rounded-2xl border-2 border-red-500 px-6 py-4 text-base font-semibold text-red-600 dark:text-red-400 mb-6"
        >
          {t("grievance.withdraw")}
        </button>
      )}

      {/* Comments Section */}
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {t("grievance.comments") || "💬 Comments & Updates"}
      </h2>
      <div className="space-y-3 mb-4">
        {grievance.comments && grievance.comments.length > 0 ? (
          grievance.comments.map((comment) => (
            <div
              key={comment.id}
              className={`card p-3 ${comment.author_role === 'government' ? 'border-l-4 border-green-500' : 'border-l-4 border-brand-500'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">
                  {comment.author_role === 'government' ? '🏛️' : '👷'}
                </span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {comment.author_name || (comment.author_role === 'government' ? 'Government Official' : 'Worker')}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{comment.content}</p>
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-sm">{t("grievance.noComments") || "No comments yet"}</p>
        )}
      </div>

      {canModify && (
        <div className="flex gap-2 mb-6">
          <input
            className="input-field flex-1"
            placeholder={t("grievance.addCommentPlaceholder") || "Add a comment..."}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
          />
          <button
            onClick={handleAddComment}
            disabled={submittingComment || !commentText.trim()}
            className="btn-primary !px-4 !py-2 disabled:opacity-40"
          >
            {submittingComment ? '⏳' : '➤'}
          </button>
        </div>
      )}

      {/* Feedback Section - only show for resolved grievances without feedback */}
      {grievance.status === 'resolved' && !grievance.worker_rating && !showFeedback && (
        <button
          onClick={() => setShowFeedback(true)}
          className="w-full card p-4 mb-6 text-left active:scale-[0.98] transition border-2 border-dashed border-brand-300 dark:border-brand-700"
        >
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
            ⭐ {t("grievance.rateResolution") || "Rate this resolution"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t("grievance.feedbackHelps") || "Your feedback helps us improve our service"}
          </p>
        </button>
      )}

      {showFeedback && (
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {t("grievance.yourFeedback") || "Your Feedback"}
          </h3>
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setFeedbackRating(star)}
                className={`text-2xl ${star <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className="input-field text-sm resize-none mb-3"
            rows={3}
            placeholder={t("grievance.feedbackPlaceholder") || "Tell us about your experience (optional)..."}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowFeedback(false)}
              className="btn-secondary flex-1 !py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitFeedback}
              disabled={submittingFeedback || feedbackRating === 0}
              className="btn-primary flex-1 !py-2 disabled:opacity-40"
            >
              {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </div>
      )}

      {/* Show submitted feedback */}
      {grievance.worker_rating && (
        <div className="card p-4 mb-6 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              ⭐ Your Rating: {grievance.worker_rating}/5
            </span>
          </div>
          {grievance.worker_feedback && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{grievance.worker_feedback}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Submitted: {grievance.feedback_at ? new Date(grievance.feedback_at).toLocaleDateString() : ''}
          </p>
        </div>
      )}
    </Screen>
  );
}
