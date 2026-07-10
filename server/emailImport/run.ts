/**
 * 从 QQ 邮箱拉取移卡机构报表并自动导入看板，完成后邮件通知。
 *
 * 用法（生产，在 app 容器内）：
 *   node dist-server/emailImport/run.js
 *
 * 本地调试：
 *   npx tsx server/emailImport/run.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";
import nodemailer from "nodemailer";
import { YIKA_ORG_REPORT_PREFIX, isYikaOrgReportFilename } from "../importAutoAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SENDER = "baseweb_report@yeahka.com";
const IMAP_HOST = "imap.qq.com";
const SMTP_HOST = "smtp.qq.com";
const SMTP_PORT = 465;

interface EmailImportConfig {
  imapUser: string;
  imapPass: string;
  smtpUser: string;
  smtpPass: string;
  notifyTo: string;
  importKey: string;
  dashboardUrl: string;
  statePath: string;
}

interface RunState {
  lastUid?: number;
  lastFilename?: string;
  lastRunAt?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

function loadConfig(): EmailImportConfig {
  const dataDir = process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data");

  return {
    imapUser: requireEnv("QQ_IMAP_USER"),
    imapPass: requireEnv("QQ_IMAP_PASS"),
    smtpUser: process.env.QQ_SMTP_USER?.trim() || requireEnv("QQ_IMAP_USER"),
    smtpPass: process.env.QQ_SMTP_PASS?.trim() || requireEnv("QQ_IMAP_PASS"),
    notifyTo: requireEnv("EMAIL_IMPORT_NOTIFY_TO"),
    importKey: requireEnv("IMPORT_API_KEY"),
    dashboardUrl: (process.env.DASHBOARD_IMPORT_URL || "http://127.0.0.1:3080").replace(/\/$/, ""),
    statePath: path.join(dataDir, "email-import-state.json"),
  };
}

function loadState(statePath: string): RunState {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as RunState;
  } catch {
    return {};
  }
}

function saveState(statePath: string, state: RunState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function pickOrgAttachment(attachments: Attachment[]): Attachment | undefined {
  return attachments.find(
    (a) => a.filename && isYikaOrgReportFilename(a.filename) && a.content && a.content.length > 0
  );
}

async function fetchLatestReport(cfg: EmailImportConfig, state: RunState) {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: cfg.imapUser, pass: cfg.imapPass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date();
    since.setDate(since.getDate() - 2);

    const uids = await client.search({
      from: SENDER,
      since,
    });

    if (!uids || uids.length === 0) {
      return { kind: "no_mail" as const };
    }

    const sorted = [...uids].sort((a, b) => a - b);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const uid = sorted[i]!;
      if (state.lastUid && uid <= state.lastUid) continue;

      const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
      if (!msg || !("source" in msg) || !msg.source) continue;

      const parsed = await simpleParser(msg.source);
      const att = pickOrgAttachment(parsed.attachments || []);
      if (!att?.filename || !att.content) continue;

      return {
        kind: "found" as const,
        uid,
        filename: att.filename,
        buffer: att.content,
        subject: parsed.subject || "(无主题)",
        date: parsed.date?.toISOString() || "",
      };
    }

    return { kind: "no_new" as const };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function uploadToDashboard(
  cfg: EmailImportConfig,
  filename: string,
  buffer: Buffer
): Promise<{ ok: boolean; message: string; imported?: number; skipped?: number }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  form.append("mode", "append");

  const res = await fetch(`${cfg.dashboardUrl}/api/import/auto`, {
    method: "POST",
    headers: { "X-Import-Key": cfg.importKey },
    body: form,
  });

  let data: { message?: string; error?: string; imported?: number; skipped?: number } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, message: `看板返回异常 HTTP ${res.status}` };
  }

  if (!res.ok) {
    return { ok: false, message: data.error || `导入失败 HTTP ${res.status}` };
  }

  return {
    ok: true,
    message: data.message || "导入完成",
    imported: data.imported,
    skipped: data.skipped,
  };
}

async function sendNotify(
  cfg: EmailImportConfig,
  subject: string,
  text: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });

  await transporter.sendMail({
    from: `"立得香港看板" <${cfg.smtpUser}>`,
    to: cfg.notifyTo,
    subject,
    text,
  });
}

async function main() {
  const cfg = loadConfig();
  const state = loadState(cfg.statePath);
  const now = new Date().toISOString();

  try {
    const mail = await fetchLatestReport(cfg, state);

    if (mail.kind === "no_mail") {
      await sendNotify(
        cfg,
        "【看板】移卡报表：未找到邮件",
        `时间：${now}\n发件人：${SENDER}\n近 2 日内未找到移卡机构报表邮件，请手动检查 QQ 邮箱。`
      );
      console.log("no mail");
      return;
    }

    if (mail.kind === "no_new") {
      await sendNotify(
        cfg,
        "【看板】移卡报表：无新邮件",
        `时间：${now}\n已处理过最新邮件（UID ${state.lastUid ?? "-"}），本次跳过。`
      );
      console.log("no new mail");
      return;
    }

    const upload = await uploadToDashboard(cfg, mail.filename, mail.buffer);
    if (!upload.ok) {
      await sendNotify(
        cfg,
        "【看板】移卡报表导入失败",
        `时间：${now}\n邮件主题：${mail.subject}\n附件：${mail.filename}\n\n${upload.message}`
      );
      process.exitCode = 1;
      return;
    }

    saveState(cfg.statePath, {
      lastUid: mail.uid,
      lastFilename: mail.filename,
      lastRunAt: now,
    });

    await sendNotify(
      cfg,
      "【看板】移卡报表导入成功",
      `时间：${now}\n邮件主题：${mail.subject}\n附件：${mail.filename}\n\n${upload.message}\n\n看板：${process.env.PUBLIC_SITE_URL?.trim() || "https://hk.orblead.com"}`
    );
    console.log("ok:", upload.message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await sendNotify(
        cfg,
        "【看板】移卡报表自动导入异常",
        `时间：${now}\n错误：${msg}`
      );
    } catch (notifyErr) {
      console.error("notify failed:", notifyErr);
    }
    console.error(err);
    process.exitCode = 1;
  }
}

main();
