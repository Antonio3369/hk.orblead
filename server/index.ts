import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSchema } from "./db.js";
import { apiRouter } from "./routes.js";
import { repairFailureMerchantSales } from "./repairFailureSales.js";
import { syncAlertAckFromFollowUps } from "./followUp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const PORT = Number(process.env.PORT ?? 3080);
const distPath = path.join(rootDir, "dist");
const useVite = process.env.USE_VITE === "1" || !fs.existsSync(distPath);

initSchema();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "merchant-transaction-agent" });
});

app.use("/api", apiRouter);

async function start() {
  if (useVite) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: rootDir,
      configFile: path.join(rootDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("开发模式：网页 + 接口 同一地址");
  } else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("生产模式：已加载 dist 静态文件");
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("  ✅ 请在浏览器打开：");
    console.log(`     http://localhost:${PORT}`);
    console.log("");
    console.log("  演示账号：admin / admin123");
    console.log("");
    setImmediate(() => {
      try {
        const repaired = repairFailureMerchantSales();
        if (repaired.relinked > 0 || repaired.salesNamed > 0) {
          console.log(
            `  已修复境外卡失败销售归属：重挂 ${repaired.relinked} 笔，补全销售 ${repaired.salesNamed} 家`
          );
        }
        const ackSync = syncAlertAckFromFollowUps();
        if (ackSync.acked > 0 || ackSync.unacked > 0) {
          console.log(
            `  預警已讀同步：${ackSync.acked} 條標為已讀，${ackSync.unacked} 條改回未讀（僅跟進後才已讀）`
          );
        }
      } catch (err) {
        console.warn("  境外卡失败销售修复跳过:", err instanceof Error ? err.message : err);
      }
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n  ❌ 端口 ${PORT} 已被占用。请先结束旧进程：`);
      console.error(`     lsof -ti :${PORT} | xargs kill\n`);
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
