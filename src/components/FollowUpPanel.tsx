import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  batchLatestFollowUps,
  fetchAttachmentBlob,
  followUpItemKey,
  loadFollowUps,
  markAdminFollowUpRead,
  submitFollowUp,
  submitFollowUpReply,
  type FollowUp,
  type FollowUpLatest,
  type FollowUpType,
} from "@/api/followUp";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/context/AuthContext";

interface FollowUpPanelProps {
  merchantId: number;
  merchantName: string;
  type: FollowUpType;
  refKey: string;
  latest?: FollowUpLatest;
  onUpdated?: () => void;
  onAcknowledged?: () => void;
  onLeaderRead?: () => void;
  ownerSalesUserId?: number | null;
  canMarkAdminRead?: boolean;
  compact?: boolean;
  viewOnly?: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-HK", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AttachmentThumb({ id, name, large }: { id: number; name: string; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    fetchAttachmentBlob(id)
      .then((url) => {
        blobUrl = url;
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [id]);
  if (!src) return <span className="follow-up-thumb-placeholder">{name}</span>;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={`follow-up-thumb ${large ? "follow-up-thumb--large" : ""}`}
    >
      <img src={src} alt={name} />
    </a>
  );
}

function HistoryList({
  history,
  loading,
  allowAdminReply,
  allowLeaderReply,
  onReload,
  onAfterReply,
}: {
  history: FollowUp[];
  loading: boolean;
  allowAdminReply?: boolean;
  allowLeaderReply?: boolean;
  onReload: () => void;
  onAfterReply?: () => void;
}) {
  const allowReply = allowAdminReply || allowLeaderReply;
  const replyLabel = allowLeaderReply && !allowAdminReply ? "主管回覆" : "管理員回覆";
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyError, setReplyError] = useState("");

  const submitReply = async (e: FormEvent, followUpId: number) => {
    e.preventDefault();
    const text = replyDraft[followUpId]?.trim();
    if (!text) {
      setReplyError("請填寫回覆內容");
      return;
    }
    setReplyingId(followUpId);
    setReplyError("");
    try {
      await submitFollowUpReply(followUpId, text);
      setReplyDraft((prev) => ({ ...prev, [followUpId]: "" }));
      onReload();
      onAfterReply?.();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "回覆失敗");
    } finally {
      setReplyingId(null);
    }
  };

  if (loading) return <PageLoader compact />;
  if (history.length === 0) {
    return (
      <p className="muted">
        {allowReply ? "該事項暫無銷售跟進記錄" : "暫無跟進記錄"}
      </p>
    );
  }

  return (
    <>
      <ul className="follow-up-history-list">
        {history.map((h) => (
          <li key={h.id}>
            <div className="follow-up-history-meta">
              <strong>{h.salesName}</strong>
              <span>{formatTime(h.createdAt)}</span>
            </div>
            <p className="follow-up-history-text">{h.actionText}</p>
            {h.attachments.length > 0 && (
              <div className="follow-up-thumbs">
                {h.attachments.map((a) => (
                  <AttachmentThumb key={a.id} id={a.id} name={a.originalName} large={allowReply} />
                ))}
              </div>
            )}
            {h.replies.length > 0 && (
              <ul className="follow-up-replies">
                {h.replies.map((r) => (
                  <li key={r.id} className="follow-up-reply-item">
                    <div className="follow-up-reply-meta">
                      <strong>{r.replierName}</strong>
                      <span>{formatTime(r.createdAt)}</span>
                    </div>
                    <p>{r.replyText}</p>
                  </li>
                ))}
              </ul>
            )}
            {allowReply && (
              <form className="follow-up-reply-form" onSubmit={(e) => submitReply(e, h.id)}>
                <label className="follow-up-label">
                  {replyLabel}
                  <textarea
                    value={replyDraft[h.id] ?? ""}
                    onChange={(e) =>
                      setReplyDraft((prev) => ({ ...prev, [h.id]: e.target.value }))
                    }
                    placeholder="對此條跟進給予指示或確認…"
                    rows={2}
                  />
                </label>
                <button type="submit" className="btn btn-sm btn-primary" disabled={replyingId === h.id}>
                  {replyingId === h.id ? "提交中…" : "提交回覆"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {replyError && <p className="form-error">{replyError}</p>}
    </>
  );
}

export function FollowUpPanel({
  merchantId,
  merchantName,
  type,
  refKey,
  latest,
  onUpdated,
  onAcknowledged,
  onLeaderRead,
  ownerSalesUserId,
  canMarkAdminRead = false,
  compact,
  viewOnly = false,
}: FollowUpPanelProps) {
  const { user } = useAuth();
  const isTeamFollowUp =
    user?.role === "leader" &&
    ownerSalesUserId != null &&
    ownerSalesUserId !== user.id;
  const readOnly = viewOnly || user?.role === "admin" || isTeamFollowUp;
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<FollowUp[]>([]);
  const [actionText, setActionText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError("");
    try {
      setHistory(await loadFollowUps(merchantId, type, refKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-scroll-lock");
    return () => {
      document.body.classList.remove("modal-scroll-lock");
    };
  }, [open]);

  const openPanel = async () => {
    setOpen(true);
    loadHistory();
    if (user?.role === "admin" && canMarkAdminRead && (latest?.count ?? 0) > 0) {
      try {
        await markAdminFollowUpRead(merchantId, type, refKey);
        onUpdated?.();
      } catch {
        /* 標記失敗不阻擋查看 */
      }
    }
  };

  const closePanel = () => {
    setOpen(false);
    setActionText("");
    setFiles([]);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = [...list].slice(0, 3);
    setError("");
    previews.forEach((p) => URL.revokeObjectURL(p));
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!actionText.trim()) {
      setError("請填寫處理說明");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitFollowUp({
        merchantId,
        type,
        refKey,
        actionText: actionText.trim(),
        photos: files,
      });
      setActionText("");
      setFiles([]);
      previews.forEach((p) => URL.revokeObjectURL(p));
      setPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadHistory();
      onUpdated?.();
      if (type === "alert") {
        onAcknowledged?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const hasFollowUp = (latest?.count ?? 0) > 0;
  const actionLabel = readOnly ? "查看跟進" : "填寫跟進";

  return (
    <>
      <div className={`follow-up-inline ${compact ? "follow-up-inline--compact" : ""}`}>
        {hasFollowUp ? (
          <span className="follow-up-status" title={latest?.latestPreview}>
            已跟進 {latest!.count} 次 · {formatTime(latest!.latestAt)}
            {readOnly && latest?.salesName ? ` · ${latest.salesName}` : ""}
          </span>
        ) : (
          <span className="follow-up-status follow-up-status--none">尚未跟進</span>
        )}
        <button type="button" className="btn btn-sm" onClick={openPanel}>
          {actionLabel}
        </button>
      </div>

      {open &&
        createPortal(
          <div className="follow-up-modal-backdrop" onClick={closePanel} role="presentation">
            <div
              className={`follow-up-modal ${readOnly ? "follow-up-modal--readonly" : ""}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="follow-up-title"
              aria-modal="true"
            >
              <div className="follow-up-modal-head">
                <div>
                  <h3 id="follow-up-title">{merchantName}</h3>
                </div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={closePanel}>
                  關閉
                </button>
              </div>

              <div className="follow-up-modal-body">
                <div className="follow-up-history">
                  <h4>{readOnly ? "銷售跟進詳情" : "歷史跟進"}</h4>
                  <HistoryList
                    history={history}
                    loading={loading}
                    allowAdminReply={user?.role === "admin"}
                    allowLeaderReply={isTeamFollowUp}
                    onReload={loadHistory}
                    onAfterReply={() => {
                      onUpdated?.();
                      if (isTeamFollowUp) onLeaderRead?.();
                    }}
                  />
                </div>

                {!readOnly && (
                  <form className="follow-up-form" onSubmit={onSubmit}>
                    <h4>新增跟進</h4>
                    <label className="follow-up-label">
                      處理說明
                      <textarea
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder="例如：已致電商戶確認；已到店拜訪…"
                        rows={4}
                        required
                      />
                    </label>
                    <div className="follow-up-label">
                      證明圖片（可選，最多 3 張）
                      <span className="follow-up-hint">
                        可從手機相冊選擇，或直接拍照上傳（建議使用帶水印的相機 App；通話截圖、到店照片等，JPG/PNG）
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/*"
                        multiple
                        hidden
                        onChange={(e) => onPickFiles(e.target.files)}
                      />
                      <div className="follow-up-file-picker">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          選擇檔案
                        </button>
                        {files.length > 0 ? (
                          <span className="follow-up-file-count muted">已選 {files.length} 張</span>
                        ) : null}
                      </div>
                    </div>
                    {previews.length > 0 && (
                      <div className="follow-up-previews">
                        {previews.map((src, i) => (
                          <img key={src} src={src} alt={`預覽 ${i + 1}`} />
                        ))}
                      </div>
                    )}
                    {error && <p className="form-error">{error}</p>}
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? "提交中…" : "提交跟進記錄"}
                    </button>
                  </form>
                )}

                {readOnly && error && <p className="form-error">{error}</p>}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export function useFollowUpLatest(
  items: Array<{ merchantId: number; type: FollowUpType; refKey: string }>
) {
  const [latest, setLatest] = useState<Record<string, FollowUpLatest>>({});
  const key = items.map((i) => followUpItemKey(i.merchantId, i.type, i.refKey)).join("|");

  useEffect(() => {
    if (!items.length) {
      setLatest({});
      return;
    }
    batchLatestFollowUps(items)
      .then(setLatest)
      .catch(() => setLatest({}));
  }, [key]);

  const refresh = () => {
    if (!items.length) return Promise.resolve();
    return batchLatestFollowUps(items).then(setLatest);
  };

  return { latest, refresh };
}
