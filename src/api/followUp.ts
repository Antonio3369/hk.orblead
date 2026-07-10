import { api, getToken } from "./client";

export type FollowUpType = "alert" | "failure";

export interface FollowUpAttachment {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface FollowUpReply {
  id: number;
  replierName: string;
  replierRole: "admin" | "leader";
  replyText: string;
  createdAt: string;
}

export interface FollowUp {
  id: number;
  merchantId: number;
  merchantName: string;
  salesUserId: number;
  salesName: string;
  type: FollowUpType;
  refKey: string;
  actionText: string;
  createdAt: string;
  attachments: FollowUpAttachment[];
  replies: FollowUpReply[];
}

export interface FollowUpLatest {
  count: number;
  latestAt: string;
  latestPreview: string;
  salesName: string;
}

export function followUpItemKey(merchantId: number, type: FollowUpType, refKey: string): string {
  return `${merchantId}:${type}:${refKey}`;
}

export async function fetchAttachmentBlob(id: number): Promise<string> {
  const token = getToken();
  const res = await fetch(`/api/follow-ups/attachments/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("無法載入圖片");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function loadFollowUps(
  merchantId: number,
  type: FollowUpType,
  refKey: string
): Promise<FollowUp[]> {
  const q = new URLSearchParams({
    merchantId: String(merchantId),
    type,
    refKey,
  });
  const data = await api<{ followUps: FollowUp[] }>(`/follow-ups?${q}`);
  return data.followUps;
}

export async function batchLatestFollowUps(
  items: Array<{ merchantId: number; type: FollowUpType; refKey: string }>
): Promise<Record<string, FollowUpLatest>> {
  if (!items.length) return {};
  const data = await api<{ latest: Record<string, FollowUpLatest> }>("/follow-ups/batch-latest", {
    method: "POST",
    json: { items },
  });
  return data.latest;
}

export async function submitFollowUp(params: {
  merchantId: number;
  type: FollowUpType;
  refKey: string;
  actionText: string;
  photos: File[];
}): Promise<FollowUp> {
  const token = getToken();
  if (!token) throw new Error("未登入");

  const form = new FormData();
  form.append("merchantId", String(params.merchantId));
  form.append("type", params.type);
  form.append("refKey", params.refKey);
  form.append("actionText", params.actionText);
  params.photos.forEach((f) => form.append("photos", f));

  const res = await fetch("/api/follow-ups", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "提交失敗");
  }
  return (data as { followUp: FollowUp }).followUp;
}

export async function markAdminFollowUpRead(
  merchantId: number,
  type: FollowUpType,
  refKey: string
): Promise<void> {
  await api("/follow-ups/mark-admin-read", {
    method: "POST",
    json: { merchantId, type, refKey },
  });
}

export async function markLeaderFollowUpRead(
  merchantId: number,
  type: FollowUpType,
  refKey: string
): Promise<void> {
  await api("/follow-ups/mark-leader-read", {
    method: "POST",
    json: { merchantId, type, refKey },
  });
}

export async function submitFollowUpReply(followUpId: number, replyText: string): Promise<FollowUpReply> {
  const data = await api<{ reply: FollowUpReply }>(`/follow-ups/${followUpId}/replies`, {
    method: "POST",
    json: { replyText },
  });
  return data.reply;
}
