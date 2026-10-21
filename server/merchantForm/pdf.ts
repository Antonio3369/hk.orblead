import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ApplicationPayload } from "./fields.js";

export const MERCHANT_FORM_DIR = path.join(process.cwd(), "server", "merchantForm");

const MAX_FRAME = 20 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

function pythonBin(): string {
  if (process.env.MERCHANT_FORM_PYTHON) return process.env.MERCHANT_FORM_PYTHON;
  const local = path.join(MERCHANT_FORM_DIR, ".venv", "bin", "python");
  if (fs.existsSync(local)) return local;
  return "python3";
}

type Job = {
  payload: ApplicationPayload;
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  settled: boolean;
};

let child: ChildProcessWithoutNullStreams | null = null;
let stdoutBuf = Buffer.alloc(0) as Buffer<ArrayBufferLike>;
let stderrBuf = "";
let queue: Job[] = [];
let active: Job | null = null;
let stopping = false;

function settle(job: Job, done: () => void) {
  if (job.settled) return;
  job.settled = true;
  clearTimeout(job.timer);
  done();
}

function killChild() {
  if (!child || child.killed) return;
  child.kill();
}

function failActive(error: Error) {
  const job = active;
  active = null;
  stdoutBuf = Buffer.alloc(0);
  if (job) settle(job, () => job.reject(error));
}

function onChildGone(error: Error) {
  child = null;
  stderrBuf = "";
  failActive(error);
  if (!stopping && queue.length > 0) pump();
  else if (stopping) {
    const pending = queue.splice(0);
    for (const job of pending) settle(job, () => job.reject(error));
  }
}

function ensureChild() {
  if (child && child.exitCode === null && !child.killed) return;
  const script = path.join(MERCHANT_FORM_DIR, "fill.py");
  if (!fs.existsSync(script)) {
    throw new Error("申請表底板未安裝");
  }
  const next = spawn(pythonBin(), [script, "--serve"], {
    cwd: MERCHANT_FORM_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  child = next;
  stdoutBuf = Buffer.alloc(0);
  stderrBuf = "";
  next.stdout.on("data", (chunk: Buffer) => {
    if (child !== next) return;
    onStdout(chunk);
  });
  next.stderr.on("data", (chunk: Buffer) => {
    stderrBuf = (stderrBuf + chunk.toString("utf8")).slice(-2000);
  });
  next.on("error", (error) => {
    if (child === next) onChildGone(error);
  });
  next.on("close", (code) => {
    if (child !== next && next.exitCode !== null) return;
    if (child === next) {
      const detail = stderrBuf.trim();
      onChildGone(new Error(detail || `生成 PDF 進程結束（${code ?? "未知"}）`));
    }
  });
  next.unref();
}

function onStdout(chunk: Buffer) {
  stdoutBuf = stdoutBuf.length === 0 ? chunk : Buffer.concat([stdoutBuf, chunk]);
  while (active) {
    if (stdoutBuf.length < 5) return;
    const flag = stdoutBuf[0];
    const len = stdoutBuf.readUInt32BE(1);
    if (len > MAX_FRAME) {
      failActive(new Error("PDF 過大"));
      killChild();
      return;
    }
    if (stdoutBuf.length < 5 + len) return;
    const body = stdoutBuf.subarray(5, 5 + len);
    stdoutBuf = stdoutBuf.subarray(5 + len);
    const job = active;
    active = null;
    if (flag === 0) settle(job, () => job.resolve(Buffer.from(body)));
    else settle(job, () => job.reject(new Error(body.toString("utf8").trim() || "生成 PDF 失敗")));
    pump();
  }
}

function pump() {
  if (active || queue.length === 0 || stopping) return;
  try {
    ensureChild();
  } catch (error) {
    const job = queue.shift();
    if (job) {
      settle(job, () => job.reject(error instanceof Error ? error : new Error("生成 PDF 失敗")));
    }
    return;
  }
  const job = queue.shift();
  if (!job || !child) return;
  active = job;
  const body = Buffer.from(JSON.stringify(job.payload));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  try {
    child.stdin.write(header);
    child.stdin.write(body);
  } catch (error) {
    failActive(error instanceof Error ? error : new Error("生成 PDF 失敗"));
    killChild();
  }
}

export function startMerchantPdfWorker(): void {
  try {
    ensureChild();
  } catch (error) {
    console.warn("商戶申請表 PDF 進程未啟動:", error instanceof Error ? error.message : error);
  }
}

export function renderApplicationPdf(payload: ApplicationPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const job: Job = {
      payload,
      resolve,
      reject,
      settled: false,
      timer: setTimeout(() => {
        settle(job, () => reject(new Error("生成 PDF 超時")));
        if (active === job) {
          active = null;
          killChild();
        } else {
          queue = queue.filter((item) => item !== job);
        }
      }, TIMEOUT_MS),
    };
    queue.push(job);
    pump();
  });
}
