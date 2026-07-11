import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { db } from "./db.js";
import { canReadMerchant } from "./access.js";
import {
  adminOnly,
  authMiddleware,
  hashPassword,
  leaderOnly,
  signToken,
  verifyPassword,
  type UserRole,
} from "./auth.js";
import {
  listMerchantMastercardLifetimeRank,
} from "./mastercardRank.js";
import { getOverseasCardOverview } from "./overseasCard.js";
import {
  getAutoImportAdminId,
  importKeyMiddleware,
  isYikaOrgReportFilename,
} from "./importAutoAuth.js";
import {
  clearLeaderTeam,
  getLeaderTeamMemberRows,
  getLeaderTeamDashboardSummary,
  getLeaderTeamSalesDetail,
  listLeaderTeamSales,
  listSalesForTeamPicker,
  setLeaderTeamMembers,
} from "./leaderTeam.js";
import { ALERT_PERIODS, countAlertsForUser, getAdminAlertsForSalesUser, getAlertsForUser, recomputeAllAlerts } from "./alertsEngine.js";
import {
  enrichAdminAlertFields,
  getAlertOversightSummary,
  getSalesAccountability,
  getSalesAccountabilityRow,
  getWeeklyAlertDigest,
} from "./alertOversight.js";
import {
  getAdminDashboardCharts,
  getPersonalDashboardCharts,
  getLeaderDashboardCharts,
  personalDashboardRole,
  countMerchantsForUser,
  getDashboardHomeInsight,
  getDashboardMonthlyStats,
  getMerchantPeriodSeries,
  getPeriodChange,
  getMerchantRankMonthLabel,
  getMtdThroughYesterdayLabel,
  getCurrentMonthLabel,
  listMerchantsForUser,
  type PeriodType,
} from "./analytics.js";
import {
  getTransactionFailureGroups,
  getTransactionFailureSummary,
} from "./cardFailure.js";
import {
  alertRefKey,
  batchLatestFollowUps,
  createFollowUp,
  createFollowUpReply,
  getAttachmentForUser,
  listFollowUps,
  markLeaderFollowUpRead,
  markAdminFollowUpRead,
  repairAckAlertsFromFollowUps,
  uploadDir,
} from "./followUp.js";
import { formatImportResultMessage, importFailureEventsOnly, importTransactionFile } from "./importService.js";
import { validateUploadFile } from "./fileValidator.js";
import { logAction } from "./audit.js";
import { getMerchantLimitProfile } from "./merchantLimitProfile.js";
import { getMerchantLimitStats, importMerchantLimitFile } from "./merchantLimitsService.js";
import { assignSalesToImportBatch, getUnmatchedSalesNames, syncMerchantSalesAssignment } from "./userSync.js";
import {
  getAlertsForSalesUser,
  getSalesPeriodComparison,
  getTigerTeamSalesUser,
  listTigerTeamSales,
} from "./tigerTeam.js";
import { getDailyDeclineThreshold, setDailyDeclineThreshold, getMastercardLifetimeWarnHkd, setMastercardLifetimeWarnHkd, getMastercardLifetimeAlertHkd, setMastercardLifetimeAlertHkd } from "./insightRules.js";
import {
  listMerchantInsightsForSales,
  sortTigerTeamRows,
  summarizeMerchantInsights,
  type SalesListSortKey,
} from "./merchantInsights.js";

function parseSalesListSort(raw: unknown): SalesListSortKey {
  const key = String(raw ?? "lastMonthAmount");
  if (
    key === "newSilent" ||
    key === "declining" ||
    key === "rising" ||
    key === "unreadAlerts"
  ) {
    return key;
  }
  return "lastMonthAmount";
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const followUpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
});

export const apiRouter = Router();

apiRouter.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "請輸入用戶名和密碼" });
    return;
  }
  const user = db
    .prepare(
      `SELECT id, username, password_hash, display_name, role, email, COALESCE(enabled, 1) as enabled
       FROM users WHERE username = ?`
    )
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        display_name: string;
        role: UserRole;
        enabled: number;
        email: string | null;
      }
    | undefined;

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: "用戶名或密碼錯誤" });
    return;
  }

  if (user.enabled === 0) {
    res.status(403).json({ error: "賬號已停用，請聯繫管理員" });
    return;
  }

  const authUser = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    email: user.email,
  };
  
  logAction(authUser, "SYSTEM_LOGIN", {
    targetType: "USER",
    targetId: user.id,
    targetName: user.display_name,
    ipAddress: req.ip,
    details: { role: user.role },
  });
  
  res.json({ token: signToken(authUser), user: authUser });
});

apiRouter.get("/auth/me", authMiddleware, (req, res) => {
  const row = db
    .prepare(
      `SELECT id, username, display_name, role, email FROM users WHERE id = ?`
    )
    .get(req.user!.id) as
    | {
        id: number;
        username: string;
        display_name: string;
        role: UserRole;
        email: string | null;
      }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  res.json({
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      email: row.email,
    },
  });
});

apiRouter.put("/auth/me", authMiddleware, (req, res) => {
  const { email } = req.body as { email?: string | null };
  if (email === undefined) {
    res.status(400).json({ error: "請提供郵箱" });
    return;
  }
  const emailVal = email?.trim() || null;
  db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(emailVal, req.user!.id);
  res.json({
    user: {
      ...req.user!,
      email: emailVal,
    },
  });
});

apiRouter.put("/auth/me/password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "請提供當前密碼，且新密碼至少 6 位" });
    return;
  }
  const row = db
    .prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .get(req.user!.id) as { password_hash: string } | undefined;
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    res.status(401).json({ error: "當前密碼不正確" });
    return;
  }
  const hash = await hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, req.user!.id);
  res.json({ ok: true });
});

apiRouter.get("/config", (_req, res) => {
  res.json({
    companyName: "立得香港",
    appTitle: "立得香港商戶交易看板",
    siteSlug: process.env.SITE_SLUG ?? "LEADSALES",
    dataSourceLabel: "支付後台",
    publicSiteUrl: process.env.PUBLIC_SITE_URL ?? null,
  });
});

apiRouter.post("/import/auto", importKeyMiddleware, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "請上傳 XLS/XLSX 文件" });
      return;
    }
    if (!isYikaOrgReportFilename(req.file.originalname)) {
      res.status(400).json({
        error: `檔名須以「54516685_機构交易數據報表」開頭（收到：${req.file.originalname}）`,
      });
      return;
    }

    const validation = validateUploadFile(req.file.originalname, req.file.buffer);
    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const adminId = getAutoImportAdminId();
    const result = importTransactionFile(
      req.file.buffer,
      req.file.originalname,
      adminId,
      "append"
    );

    if (!result.ok) {
      res.status(400).json({ error: "導入失敗", details: result.errors });
      return;
    }

    const skipped = result.skipped ?? 0;
    const failuresSkipped = result.failuresSkipped ?? 0;

    res.json({
      message: formatImportResultMessage({
        imported: result.imported,
        skipped,
        failuresImported: result.failuresImported ?? 0,
        failuresSkipped,
        failuresOnly: false,
      }),
      imported: result.imported,
      skipped,
      failuresImported: result.failuresImported ?? 0,
      failuresSkipped,
      errors: result.errors,
      batchId: result.batchId,
    });
  } catch (err) {
    console.error("import/auto error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "導入時伺服器異常",
    });
  }
});

apiRouter.use(authMiddleware);

apiRouter.get("/merchants", (req, res) => {
  const merchants = listMerchantsForUser(req.user!.id, req.user!.role);
  res.json({
    merchants,
    rankMonth: getMerchantRankMonthLabel(),
    mtdLabel: getMtdThroughYesterdayLabel(),
    currentMonth: getCurrentMonthLabel(),
  });
});

apiRouter.get("/merchants/mastercard-ranking", (req, res) => {
  res.json(listMerchantMastercardLifetimeRank(req.user!.id, req.user!.role));
});

apiRouter.get("/overseas-cards/overview", (req, res) => {
  res.json(getOverseasCardOverview(req.user!.id, req.user!.role));
});

apiRouter.get("/merchants/:id", (req, res) => {
  const id = Number(req.params.id);
  const merchant = db
    .prepare(
      `SELECT m.id, m.name, m.sales_user_id,
        COALESCE(NULLIF(TRIM(m.sales_name), ''), u.display_name, '待分配') as salesName
       FROM merchants m
       LEFT JOIN users u ON u.id = m.sales_user_id
       WHERE m.id = ?`
    )
    .get(id) as
    | { id: number; name: string; sales_user_id: number | null; salesName: string }
    | undefined;
  if (!merchant) {
    res.status(404).json({ error: "商戶不存在" });
    return;
  }
  if (!canReadMerchant(req.user!.role, req.user!.id, merchant.sales_user_id)) {
    res.status(403).json({ error: "無權查看該商戶" });
    return;
  }

  const transactions = db
    .prepare(
      `SELECT id, txn_name, txn_time, amount, detail FROM transactions
       WHERE merchant_id = ? ORDER BY txn_time DESC LIMIT 500`
    )
    .all(id);

  const periods = (["day", "week", "month"] as PeriodType[]).map((p) => ({
    period: p,
    series: getMerchantPeriodSeries(id, p),
    change: getPeriodChange(id, p),
  }));

  res.json({
    merchant,
    transactions,
    periods,
    limitProfile: getMerchantLimitProfile(id),
  });
});

apiRouter.get("/card-failures", (req, res) => {
  const groups = getTransactionFailureGroups(req.user!.id, req.user!.role);
  const summary = getTransactionFailureSummary(req.user!.id, req.user!.role);
  res.json({ groups, summary, refKey: groups[0]?.refKey ?? null });
});

apiRouter.get("/follow-ups", (req, res) => {
  const merchantId = Number(req.query.merchantId);
  const type = req.query.type as "alert" | "failure" | undefined;
  const refKey = req.query.refKey as string | undefined;
  if (!merchantId || !type || !refKey || (type !== "alert" && type !== "failure")) {
    res.status(400).json({ error: "參數不完整" });
    return;
  }
  const followUps = listFollowUps(merchantId, type, refKey, req.user!.id, req.user!.role);
  res.json({ followUps });
});

apiRouter.post("/follow-ups/batch-latest", (req, res) => {
  const { items } = req.body as {
    items?: Array<{ merchantId: number; type: "alert" | "failure"; refKey: string }>;
  };
  if (!items?.length) {
    res.json({ latest: {} });
    return;
  }
  const latest = batchLatestFollowUps(items, req.user!.id, req.user!.role);
  res.json({ latest });
});

apiRouter.post("/follow-ups/mark-admin-read", adminOnly, (req, res) => {
  const { merchantId, type, refKey } = req.body as {
    merchantId?: number;
    type?: "alert" | "failure";
    refKey?: string;
  };
  if (!merchantId || (type !== "alert" && type !== "failure") || !refKey?.trim()) {
    res.status(400).json({ error: "參數不完整" });
    return;
  }
  const ok = markAdminFollowUpRead(req.user!.id, merchantId, type, refKey.trim());
  if (!ok) {
    res.status(403).json({ error: "無權標記此跟進為已閱" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post("/follow-ups/mark-leader-read", leaderOnly, (req, res) => {
  const { merchantId, type, refKey } = req.body as {
    merchantId?: number;
    type?: "alert" | "failure";
    refKey?: string;
  };
  if (!merchantId || (type !== "alert" && type !== "failure") || !refKey?.trim()) {
    res.status(400).json({ error: "參數不完整" });
    return;
  }
  const ok = markLeaderFollowUpRead(req.user!.id, merchantId, type, refKey.trim());
  if (!ok) {
    res.status(403).json({ error: "僅可標記團隊銷售的跟進為已閱" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post(
  "/follow-ups",
  followUpUpload.array("photos", 3),
  (req, res) => {
    const merchantId = Number(req.body.merchantId);
    const type = req.body.type as "alert" | "failure";
    const refKey = String(req.body.refKey ?? "").trim();
    const actionText = String(req.body.actionText ?? "");

    if (!merchantId || (type !== "alert" && type !== "failure") || !refKey) {
      res.status(400).json({ error: "參數不完整" });
      return;
    }

    const files = Array.isArray(req.files)
      ? (req.files as { buffer: Buffer; originalname: string; mimetype: string; size: number }[])
      : [];

    try {
      const followUp = createFollowUp(
        merchantId,
        type,
        refKey,
        actionText,
        req.user!.id,
        req.user!.role,
        files.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
        }))
      );
      res.json({ followUp });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";
      if (msg === "FORBIDDEN") {
        res.status(403).json({ error: "無權操作該商戶" });
        return;
      }
      if (msg === "EMPTY_TEXT") {
        res.status(400).json({ error: "請填寫處理說明" });
        return;
      }
      if (msg === "TOO_MANY_FILES") {
        res.status(400).json({ error: "最多上傳 3 張圖片" });
        return;
      }
      if (msg === "INVALID_MIME") {
        res.status(400).json({ error: "僅支持 JPG / PNG / WebP 圖片" });
        return;
      }
      if (msg === "FILE_TOO_LARGE") {
        res.status(400).json({ error: "單張圖片不能超過 5MB" });
        return;
      }
      if (msg === "ADMIN_CANNOT_SUBMIT") {
        res.status(403).json({ error: "管理員請使用「回覆跟進」，不可代替銷售提交" });
        return;
      }
      res.status(500).json({ error: "提交失敗" });
    }
  }
);

apiRouter.post("/follow-ups/:id/replies", (req, res) => {
  const role = req.user!.role;
  if (role !== "admin" && role !== "leader") {
    res.status(403).json({ error: "無權回覆跟進" });
    return;
  }
  const id = Number(req.params.id);
  const { replyText } = req.body as { replyText?: string };
  if (!id) {
    res.status(400).json({ error: "無效 ID" });
    return;
  }
  try {
    const reply = createFollowUpReply(id, req.user!.id, role, replyText ?? "");
    res.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (msg === "EMPTY_TEXT") {
      res.status(400).json({ error: "請填寫回覆內容" });
      return;
    }
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "跟進記錄不存在" });
      return;
    }
    if (msg === "FORBIDDEN") {
      res.status(403).json({ error: role === "leader" ? "僅可回覆團隊銷售的跟進" : "無權回覆" });
      return;
    }
    res.status(500).json({ error: "回覆失敗" });
  }
});

apiRouter.get("/follow-ups/attachments/:id", (req, res) => {
  const id = Number(req.params.id);
  const att = getAttachmentForUser(id, req.user!.id, req.user!.role);
  if (!att) {
    res.status(404).json({ error: "附件不存在或無權查看" });
    return;
  }
  const filePath = path.join(uploadDir, att.storedName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "文件不存在" });
    return;
  }
  res.setHeader("Content-Type", att.mimeType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(att.originalName)}`
  );
  fs.createReadStream(filePath).pipe(res);
});

apiRouter.get("/alerts", (req, res) => {
  const period = req.query.period as PeriodType | undefined;
  const rows = getAlertsForUser(req.user!.id, req.user!.role, period) as Array<
    Record<string, unknown> & {
      merchant_id: number;
      period: string;
      current_label: string;
      acknowledged: number;
      admin_read: number;
      has_leader_reply: number;
      computed_at: string;
      sales_user_id: number | null;
    }
  >;
  const isAdmin = req.user!.role === "admin";
  const alerts = rows.map((a) => {
    const base = {
      ...a,
      ref_key: alertRefKey(String(a.period), String(a.current_label)),
    };
    if (!isAdmin) return base;
    return {
      ...base,
      ...enrichAdminAlertFields({
        acknowledged: a.acknowledged,
        admin_read: a.admin_read,
        has_leader_reply: a.has_leader_reply,
        computed_at: String(a.computed_at),
        merchant_id: a.merchant_id,
        period: String(a.period),
        current_label: String(a.current_label),
        sales_user_id: a.sales_user_id,
      }),
    };
  });
  res.json({ alerts });
});

apiRouter.get("/alerts/oversight", adminOnly, (req, res) => {
  const period = req.query.period as PeriodType | undefined;
  res.json({ summary: getAlertOversightSummary(period) });
});

apiRouter.get("/alerts/sales-accountability", adminOnly, (req, res) => {
  const period = req.query.period as PeriodType | undefined;
  res.json({ rows: getSalesAccountability(period) });
});

apiRouter.get("/alerts/oversight/sales/:salesKey", adminOnly, (req, res) => {
  const period = req.query.period as PeriodType | undefined;
  const salesKey = req.params.salesKey;
  const salesNameParam = typeof req.query.name === "string" ? req.query.name.trim() : "";
  let salesUserId: number | null;
  let salesName: string | null = null;

  if (salesKey === "unassigned") {
    salesUserId = null;
    salesName = salesNameParam || "待分配";
  } else {
    salesUserId = Number(salesKey);
    if (!Number.isFinite(salesUserId)) {
      res.status(400).json({ error: "無效的銷售 ID" });
      return;
    }
    const user = db.prepare(`SELECT id, display_name FROM users WHERE id = ? AND role != 'admin'`).get(
      salesUserId
    ) as { id: number; display_name: string } | undefined;
    if (!user) {
      res.status(404).json({ error: "銷售不存在" });
      return;
    }
    salesName = user.display_name;
  }

  const rows = getAdminAlertsForSalesUser(salesUserId, period, salesName) as Array<
    Record<string, unknown> & {
      merchant_id: number;
      period: string;
      current_label: string;
      acknowledged: number;
      admin_read: number;
      has_leader_reply: number;
      computed_at: string;
      sales_user_id: number | null;
      sales_name: string;
    }
  >;

  const alerts = rows.map((a) => ({
    ...a,
    ref_key: alertRefKey(String(a.period), String(a.current_label)),
    ...enrichAdminAlertFields({
      acknowledged: a.acknowledged,
      admin_read: a.admin_read,
      has_leader_reply: a.has_leader_reply,
      computed_at: String(a.computed_at),
      merchant_id: a.merchant_id,
      period: String(a.period),
      current_label: String(a.current_label),
      sales_user_id: a.sales_user_id,
    }),
  }));

  const stats = getSalesAccountabilityRow(salesUserId, period, salesName ?? undefined) ?? {
    salesUserId,
    salesName: salesName ?? "待分配",
    unfollowed: alerts.filter((a) => !a.acknowledged).length,
    maxStaleDays: 0,
    followed: alerts.filter((a) => !!a.acknowledged).length,
    followedThisWeek: 0,
    total: alerts.length,
  };

  res.json({
    sales: {
      userId: salesUserId,
      displayName: stats.salesName,
    },
    stats,
    alerts,
  });
});

apiRouter.post("/alerts/:id/ack", (req, res) => {
  const id = Number(req.params.id);
  const alert = db
    .prepare(
      `SELECT a.id, m.sales_user_id FROM alerts a JOIN merchants m ON m.id = a.merchant_id WHERE a.id = ?`
    )
    .get(id) as { id: number; sales_user_id: number | null } | undefined;
  if (!alert) {
    res.status(404).json({ error: "預警不存在" });
    return;
  }
  if (req.user!.role !== "admin" && alert.sales_user_id !== req.user!.id) {
    res.status(403).json({ error: "無權操作" });
    return;
  }
  db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

apiRouter.get("/alert-rules", (_req, res) => {
  const rules = db
    .prepare(`SELECT * FROM alert_rules WHERE period IN ('week', 'month') ORDER BY period`)
    .all();
  res.json({ rules });
});

apiRouter.put("/alert-rules/:period", adminOnly, (req, res) => {
  const period = req.params.period as PeriodType;
  const { thresholdPercent, enabled, direction } = req.body as {
    thresholdPercent?: number;
    enabled?: boolean;
    direction?: "decrease" | "increase";
  };
  if (!ALERT_PERIODS.includes(period as (typeof ALERT_PERIODS)[number])) {
    res.status(400).json({ error: "無效週期，預警僅支持週、月" });
    return;
  }
  db.prepare(
    `UPDATE alert_rules SET threshold_percent = COALESCE(?, threshold_percent),
     enabled = COALESCE(?, enabled), direction = COALESCE(?, direction) WHERE period = ?`
  ).run(
    thresholdPercent ?? null,
    enabled === undefined ? null : enabled ? 1 : 0,
    direction ?? null,
    period
  );
  recomputeAllAlerts();
  repairAckAlertsFromFollowUps();
  const rules = db.prepare(`SELECT * FROM alert_rules`).all();
  res.json({ rules });
});

apiRouter.get("/insight-settings", adminOnly, (_req, res) => {
  res.json({
    dailyDeclineThresholdPercent: getDailyDeclineThreshold(),
    mastercardLifetimeWarnHkd: getMastercardLifetimeWarnHkd(),
    mastercardLifetimeAlertHkd: getMastercardLifetimeAlertHkd(),
    mastercardLifetimeHighlightHkd: getMastercardLifetimeWarnHkd(),
  });
});

apiRouter.put("/insight-settings/daily-decline-threshold", adminOnly, (req, res) => {
  try {
    const { thresholdPercent } = req.body as { thresholdPercent?: number };
    const value = setDailyDeclineThreshold(Number(thresholdPercent));
    res.json({ dailyDeclineThresholdPercent: value });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "設定失敗" });
  }
});

apiRouter.put("/insight-settings/mastercard-lifetime-highlight", adminOnly, (req, res) => {
  try {
    const { thresholdHkd } = req.body as { thresholdHkd?: number };
    const value = setMastercardLifetimeWarnHkd(Number(thresholdHkd));
    res.json({ mastercardLifetimeWarnHkd: value, mastercardLifetimeHighlightHkd: value });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "設定失敗" });
  }
});

apiRouter.put("/insight-settings/mastercard-lifetime-alert", adminOnly, (req, res) => {
  try {
    const { thresholdHkd } = req.body as { thresholdHkd?: number };
    const value = setMastercardLifetimeAlertHkd(Number(thresholdHkd));
    res.json({ mastercardLifetimeAlertHkd: value });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "設定失敗" });
  }
});

apiRouter.post(
  "/import",
  adminOnly,
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "請上傳 CSV 或 XLS/XLSX 文件" });
        return;
      }
      const mode = (req.body.mode as string) === "replace" ? "replace" : "append";
      const failuresOnly = req.body.scope === "failuresOnly";
      const salesOverride = String(req.body.salesName ?? "").trim() || undefined;

      const validation = validateUploadFile(req.file.originalname, req.file.buffer);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const result = failuresOnly
        ? importFailureEventsOnly(req.file.buffer, req.file.originalname, req.user!.id, salesOverride)
        : importTransactionFile(
            req.file.buffer,
            req.file.originalname,
            req.user!.id,
            mode,
            salesOverride
          );

      if (!result.ok) {
        res.status(400).json({ error: "導入失敗", details: result.errors });
        return;
      }

      const skipped = (result as { skipped?: number }).skipped ?? 0;
      const failuresSkipped = (result as { failuresSkipped?: number }).failuresSkipped ?? 0;

      res.json({
        message: formatImportResultMessage({
          imported: result.imported,
          skipped,
          failuresImported: result.failuresImported ?? 0,
          failuresSkipped,
          failuresOnly,
        }),
        imported: result.imported,
        skipped,
        failuresImported: result.failuresImported ?? 0,
        failuresSkipped,
        errors: result.errors,
        batchId: result.batchId,
      });
    } catch (err) {
      console.error("import error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "導入時伺服器異常",
      });
    }
  }
);

apiRouter.post(
  "/import/limits",
  adminOnly,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "請上傳 CSV 或 XLS/XLSX 文件" });
      return;
    }
    
    const validation = validateUploadFile(req.file.originalname, req.file.buffer);
    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const kind = req.body.kind === "scan" ? "scan" : "card";
    const result = importMerchantLimitFile(
      req.file.buffer,
      req.file.originalname,
      req.user!.id,
      kind
    );
    if (!result.ok) {
      res.status(400).json({ error: "導入失敗", details: result.errors });
      return;
    }

    const kindLabel = kind === "card" ? "刷卡" : "掃碼";
    res.json({
      message: `${kindLabel}額度：新增 ${result.imported} 家、覆蓋更新 ${result.updated} 家（按商戶編號去重，不累加）${
        result.merchantsLinked > 0 ? `，補全 ${result.merchantsLinked} 家商戶編號` : ""
      }${result.duplicates > 0 ? `，檔內去重 ${result.duplicates} 行` : ""}${
        result.skipped > 0 ? `，${result.skipped} 行已跳過` : ""
      }`,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      duplicates: result.duplicates,
      merchantsLinked: result.merchantsLinked,
      errors: result.errors,
    });
  }
);

apiRouter.get("/import/limits/stats", adminOnly, (_req, res) => {
  res.json(getMerchantLimitStats());
});

apiRouter.get("/import/batches", adminOnly, (_req, res) => {
  const batches = db
    .prepare(
      `SELECT b.id, b.filename, b.row_count, b.imported_at,
        (SELECT COUNT(DISTINCT m.id) FROM merchants m
         WHERE TRIM(COALESCE(m.sales_name, '')) = ''
           AND m.id IN (
             SELECT merchant_id FROM transactions WHERE batch_id = b.id
             UNION
             SELECT merchant_id FROM card_failure_events WHERE batch_id = b.id
           )) as unassigned_merchants
       FROM import_batches b
       ORDER BY b.id DESC
       LIMIT 30`
    )
    .all();
  res.json({ batches });
});

apiRouter.post("/import/batches/:id/assign-sales", adminOnly, (req, res) => {
  const batchId = Number(req.params.id);
  const { salesName } = req.body as { salesName?: string };
  if (!salesName?.trim()) {
    res.status(400).json({ error: "請指定銷售名（須與銷售帳號一致）" });
    return;
  }
  const batch = db.prepare(`SELECT id FROM import_batches WHERE id = ?`).get(batchId);
  if (!batch) {
    res.status(404).json({ error: "導入批次不存在" });
    return;
  }
  const result = assignSalesToImportBatch(batchId, salesName.trim());
  res.json({
    ok: true,
    message: `已為 ${result.merchantsUpdated} 家商戶指定銷售「${salesName.trim()}」，同步 ${result.synced} 家`,
    ...result,
  });
});

apiRouter.get("/stats/overview", (req, res) => {
  const role = req.user!.role;
  const userId = req.user!.id;
  const dashRole = personalDashboardRole(role);
  const isAdmin = role === "admin";
  const alertCounts = countAlertsForUser(userId, dashRole);
  const transactionFailures = getTransactionFailureSummary(userId, dashRole);
  const alertDigest = isAdmin ? getWeeklyAlertDigest() : undefined;
  const homeInsight = isAdmin ? undefined : getDashboardHomeInsight(userId, role);
  const adminCharts = isAdmin ? getAdminDashboardCharts(userId, role) : undefined;
  const personalCharts =
    role === "sales" || role === "leader" ? getPersonalDashboardCharts(userId) : undefined;

  res.json({
    merchantCount: countMerchantsForUser(userId, dashRole),
    activeAlerts: alertCounts.unread,
    unreadAlerts: alertCounts.unread,
    totalAlerts: alertCounts.total,
    transactionFailures,
    monthlyStats: isAdmin ? undefined : getDashboardMonthlyStats(userId, dashRole),
    adminCharts,
    personalCharts,
    dailyTrend: undefined,
    rolling30: undefined,
    tigerTeam: undefined,
    alertDigest,
    homeInsight,
  });
});

apiRouter.get("/leader/team/overview", leaderOnly, (req, res) => {
  const leaderId = req.user!.id;
  res.json({
    teamSummary: getLeaderTeamDashboardSummary(leaderId),
    charts: getLeaderDashboardCharts(leaderId),
  });
});

apiRouter.get("/leader/team", leaderOnly, (req, res) => {
  const sort = parseSalesListSort(req.query.sort);
  res.json({ sales: sortTigerTeamRows(listLeaderTeamSales(req.user!.id), sort) });
});

apiRouter.get("/leader/team/:id", leaderOnly, (req, res) => {
  const salesUserId = Number(req.params.id);
  const detail = getLeaderTeamSalesDetail(req.user!.id, salesUserId);
  if (!detail) {
    res.status(404).json({ error: "銷售不在您的團隊或不存在" });
    return;
  }
  res.json({
    sales: detail.sales,
    periods: detail.periods,
    insightSummary: detail.insightSummary,
    merchants: detail.merchants,
    alerts: detail.alerts.map((a) => ({
      ...(a as Record<string, unknown>),
      ref_key: alertRefKey(
        String((a as { period: string }).period),
        String((a as { current_label: string }).current_label)
      ),
    })),
  });
});

apiRouter.get("/tiger-team", adminOnly, (req, res) => {
  const sort = parseSalesListSort(req.query.sort);
  res.json({ sales: sortTigerTeamRows(listTigerTeamSales(), sort) });
});

apiRouter.get("/tiger-team/:id", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const sales = getTigerTeamSalesUser(id);
  if (!sales) {
    res.status(404).json({ error: "銷售不存在或已停用" });
    return;
  }
  const merchants = listMerchantInsightsForSales(id);
  res.json({
    sales,
    periods: getSalesPeriodComparison(id),
    insightSummary: summarizeMerchantInsights(merchants),
    merchants,
    alerts: getAlertsForSalesUser(id).map((a) => ({
      ...(a as Record<string, unknown>),
      ref_key: alertRefKey(String((a as { period: string }).period), String((a as { current_label: string }).current_label)),
    })),
  });
});

apiRouter.get("/users", adminOnly, (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, COALESCE(u.enabled, 1) as enabled,
        u.email,
        (SELECT COUNT(*) FROM merchants m WHERE m.sales_user_id = u.id) as merchant_count,
        (SELECT COUNT(*) FROM leader_team_members m WHERE m.leader_user_id = u.id) as team_member_count,
        lg.display_name as leader_display_name
       FROM users u
       LEFT JOIN leader_team_members tm ON tm.sales_user_id = u.id
       LEFT JOIN users lg ON lg.id = tm.leader_user_id
       ORDER BY u.role, u.display_name, u.username`
    )
    .all();
  res.json({ users });
});

apiRouter.put("/users/:id", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { displayName, email, username } = req.body as {
    displayName?: string;
    email?: string | null;
    username?: string;
  };
  const target = db.prepare(`SELECT id, role, username, display_name FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string; username: string; display_name: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "不能在此修改管理員資料" });
    return;
  }

  const nextDisplayName = displayName?.trim() || target.display_name;
  if (!nextDisplayName) {
    res.status(400).json({ error: "顯示名不能為空" });
    return;
  }

  let nextUsername = target.username;
  if (username !== undefined) {
    const trimmed = username.trim();
    if (!trimmed) {
      res.status(400).json({ error: "登入名不能為空" });
      return;
    }
    if (/\s/.test(trimmed)) {
      res.status(400).json({ error: "登入名不能含空格" });
      return;
    }
    const taken = db
      .prepare(`SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?`)
      .get(trimmed, id) as { id: number } | undefined;
    if (taken) {
      res.status(409).json({ error: "登入名已被使用" });
      return;
    }
    nextUsername = trimmed;
  }

  const emailVal = email === undefined ? undefined : email?.trim() || null;
  if (emailVal !== undefined) {
    db.prepare(`UPDATE users SET username = ?, display_name = ?, email = ? WHERE id = ?`).run(
      nextUsername,
      nextDisplayName,
      emailVal,
      id
    );
  } else {
    db.prepare(`UPDATE users SET username = ?, display_name = ? WHERE id = ?`).run(
      nextUsername,
      nextDisplayName,
      id
    );
  }
  syncMerchantSalesAssignment();
  res.json({ ok: true, username: nextUsername, displayName: nextDisplayName });
});

apiRouter.post("/users", adminOnly, async (req, res) => {
  const { username, password, displayName, role, email } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: UserRole;
    email?: string;
  };
  if (!username || !password || !displayName) {
    res.status(400).json({ error: "缺少必填欄位" });
    return;
  }
  const userRole = role ?? "sales";
  if (userRole === "admin") {
    res.status(400).json({ error: "不能創建管理員帳號" });
    return;
  }
  const hash = await hashPassword(password);
  const emailVal = email?.trim() || null;
  try {
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role, email) VALUES (?, ?, ?, ?, ?)`
    ).run(username, hash, displayName, userRole, emailVal);
    if (userRole === "sales" || userRole === "leader") {
      syncMerchantSalesAssignment();
    }
    
    logAction(req.user!, "USER_CREATE", {
      targetType: "USER",
      targetId: Number(result.lastInsertRowid),
      targetName: displayName,
      details: { username, role: userRole },
    });
    
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "用戶名已存在" });
  }
});

apiRouter.put("/users/:id/password", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body as { password?: string };
  if (!password || password.length < 6) {
    res.status(400).json({ error: "密碼至少 6 位" });
    return;
  }
  const hash = await hashPassword(password);
  const r = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, id);
  if (r.changes === 0) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.put("/users/:id/status", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { enabled } = req.body as { enabled?: boolean };
  if (enabled === undefined) {
    res.status(400).json({ error: "請指定 enabled 狀態" });
    return;
  }
  const target = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "不能停用管理員賬號" });
    return;
  }
  db.prepare(`UPDATE users SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
  res.json({ ok: true });
});

apiRouter.delete("/users/:id", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare(`SELECT id, role, display_name FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string; display_name: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "不能刪除管理員賬號" });
    return;
  }
  db.prepare(`UPDATE merchants SET sales_user_id = NULL WHERE sales_user_id = ?`).run(id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  res.json({ ok: true });
});

apiRouter.put("/users/:id/role", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body as { role?: UserRole };
  if (role !== "sales" && role !== "leader") {
    res.status(400).json({ error: "角色須為 sales 或 leader" });
    return;
  }
  const target = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: "用戶不存在" });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "不能修改管理員角色" });
    return;
  }
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
  if (role === "sales") {
    clearLeaderTeam(id);
  }
  if (role === "sales" || role === "leader") {
    syncMerchantSalesAssignment();
  }
  res.json({ ok: true });
});

apiRouter.get("/users/:id/team", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target || target.role !== "leader") {
    res.status(400).json({ error: "僅主管帳號可配置團隊" });
    return;
  }
  const members = getLeaderTeamMemberRows(id);
  const allSales = listSalesForTeamPicker(id);
  res.json({ members, allSales, memberIds: members.map((m) => m.id) });
});

apiRouter.put("/users/:id/team", adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const { salesUserIds } = req.body as { salesUserIds?: number[] };
  const target = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target || target.role !== "leader") {
    res.status(400).json({ error: "僅主管帳號可配置團隊" });
    return;
  }
  try {
    setLeaderTeamMembers(id, salesUserIds ?? []);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "配置失敗" });
  }
});

apiRouter.post("/users/sync-merchants", adminOnly, (_req, res) => {
  const result = syncMerchantSalesAssignment();
  const unmatched = getUnmatchedSalesNames();
  const unmatchedMerchants = unmatched.reduce((s, u) => s + u.merchantCount, 0);
  let message = `已同步 ${result.updated} 家商戶的銷售歸屬（${result.matchedMerchants} 個銷售名下有商戶）`;
  if (result.updated === 0 && unmatched.length > 0) {
    message += `。另有 ${unmatchedMerchants} 家商戶的銷售名未能匹配帳號`;
  }
  res.json({
    ok: true,
    message,
    unmatched,
    ...result,
  });
});

apiRouter.get("/audit/logs", adminOnly, (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const actionType = typeof req.query.actionType === "string" ? req.query.actionType : undefined;
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 100;
  
  const params: (number | string)[] = [];
  let sql = `
    SELECT al.*, u.display_name as operator_name 
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `;
  
  if (userId !== undefined) {
    sql += " AND al.user_id = ?";
    params.push(userId);
  }
  if (actionType) {
    sql += " AND al.action_type = ?";
    params.push(actionType);
  }
  sql += " ORDER BY al.created_at DESC LIMIT ?";
  params.push(limit);
  
  const logs = db.prepare(sql).all(...params);
  res.json({ logs });
});
