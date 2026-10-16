import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ApplicationPayload } from "./fields.js";

export const MERCHANT_FORM_DIR = path.join(process.cwd(), "server", "merchantForm");

function pythonBin(): string {
  if (process.env.MERCHANT_FORM_PYTHON) return process.env.MERCHANT_FORM_PYTHON;
  const local = path.join(MERCHANT_FORM_DIR, ".venv", "bin", "python");
  if (fs.existsSync(local)) return local;
  return "python3";
}

export function renderApplicationPdf(payload: ApplicationPayload): Promise<Buffer> {
  const script = path.join(MERCHANT_FORM_DIR, "fill.py");
  if (!fs.existsSync(script)) {
    return Promise.reject(new Error("申請表底板未安裝"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [script], { cwd: MERCHANT_FORM_DIR });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("生成 PDF 超時"));
    }, 60_000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(err).toString("utf8").trim();
        reject(new Error(detail || `生成 PDF 失敗（${code}）`));
        return;
      }
      resolve(Buffer.concat(out));
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
