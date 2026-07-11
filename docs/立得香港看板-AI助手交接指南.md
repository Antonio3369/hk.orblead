# 立得香港看板 · AI 助手交接指南

> **用途**：给 Cursor / 新 AI 助手或新开发者。**读完本文应能独立改功能、查 bug、发版。**  
> **最后更新**：2026-07-11  
> **Mac 路径**：`/Users/xin/projects/hk.orblead`（历史亦写作 `sales-data-agent`）  
> **生产**：https://hk.orblead.com · 服务器 `43.136.25.181:3080` · 目录 `/opt/sales-data-agent`  
> **最新部署包**：`release/sales-agent-20260711-1749.tgz`

---

## 〇、给 AI 的开场白（用户可直接复制）

```
我在维护 sales-data-agent（立得香港商户交易看板）。
请先完整阅读 docs/立得香港看板-AI助手交接指南.md，再动手改代码。

关键约束：
1. 三角色：admin / leader / sales。Leader 工作台 = 本人商户；团队数据在「我的團隊」。
2. 销售登录名 users.username 须与移卡 Excel「業務員」列一致（如 sam202512），不是 display_name。
3. 前端无 react-router，路由在 src/App.tsx 的 view state；侧栏在 src/config/navigation.ts。
4. 机构报表用 append 追加导入；勿用 sam202512.xlsx 个人文件修复交易额。
5. 发版：Mac npm run pack:deploy → 服务器 tar 解压 → docker compose up -d --build（勿 restart）。
6. 改登入名、邮件自动导入：代码已有，生产启用前需与运营确认。
7. tools/alipay/ 与看板无关，不要上传服务器。
```

---

## 一、项目是什么

| 项 | 说明 |
|----|------|
| **npm 包名** | `merchant-transaction-agent` |
| **业务** | 移卡机构每日交易 Excel → SQLite → 销售/主管/admin Web 看板 |
| **用户** | 7 位销售 + 主管 + admin；销售户外用手机 |
| **上游** | 邮件附件 `54516685_機构交易數據報表_YYYY-MM-DD.xlsx`（含 **業務員** 列） |
| **技术栈** | Node 22 + Express 5 + SQLite（Node 内置 `node:sqlite`）+ React 19 + Vite + Recharts + Docker |

**不要混淆**：`tools/alipay/` 是本地实验，与看板部署无关。

---

## 二、架构总览

```mermaid
flowchart TB
  subgraph upstream [上游]
    Excel[移卡机构报表 xlsx]
    Email[QQ 邮箱 IMAP 可选]
  end

  subgraph server [Node Express :3080]
    Import[importParser / importService]
    Analytics[analytics / merchantInsights]
    Alerts[alertsEngine / followUp]
    API[routes.ts /api/*]
    DB[(SQLite app.db)]
  end

  subgraph frontend [React SPA dist/]
    App[App.tsx view state]
    Nav[SidebarNav + navigation.ts]
    Pages[Dashboard / Merchants / Admin...]
  end

  Excel --> Import
  Email --> Import
  Import --> DB
  Analytics --> DB
  Alerts --> DB
  API --> Analytics
  API --> Alerts
  API --> Import
  Pages -->|fetch /api| API
  App --> Nav
  App --> Pages
```

**请求路径**：浏览器 → Nginx（hk.orblead.com）→ Docker `app:3080` → `dist/` 静态 + `/api/*`。

---

## 三、目录与关键文件

### 3.1 根目录

| 路径 | 说明 | 上传生产 |
|------|------|----------|
| `src/` | React 前端源码 | 否（打包进 `dist/`） |
| `server/` | Express 后端源码 | 否（编译进 `dist-server/`） |
| `dist/`、`dist-server/` | 构建产物 | **是** |
| `data/` | 本地 SQLite（可 200MB+） | **否**（生产用 Docker 卷） |
| `numbers/` | 测试用机构 Excel | **否**（deploy-pack 已排除） |
| `tools/` | 沙箱脚本、验证脚本 | **否** |
| `docs/` | 文档 | 可选 |
| `.cursor/rules/` | Cursor 规则（发版、账号、UI） | 可选 |
| `scripts/` | 部署打包脚本 | 否 |
| `release/` | 打好的 `.tgz` 部署包 | 否 |
| `secrets/` | 私钥等 | **否** |
| `deploy/` | Nginx 配置示例 | 可选 |

### 3.1.1 配置文件

| 文件 | 说明 |
|------|------|
| `.env` | JWT 等（Mac 可选，**服务器必须有**） |
| `.env.example` | 环境变量模板 |
| `docker-compose.yml` | Docker 启动（`Dockerfile.prod`） |
| `Dockerfile.prod` | **生产用**：直接用 dist，不在服务器编译 |
| `vite.config.ts` | 前端构建 |

**不要**把 `tools/alipay/.env` 或 `tools/alipay/.venv/` 当成看板配置上传。

### 3.1.2 三个环境别混

| | Mac 项目文件夹 | 腾讯云 `/opt/sales-data-agent` |
|--|----------------|--------------------------------|
| 改代码 | ✅ | ❌ 尽量只解压 / `--build` |
| `.env` | 本地测试用 | **生产 JWT** |
| `tools/alipay/` | 本地实验 | **不要上传** |
| 数据库 | `data/app.db` | Docker 卷 `sales-data-agent_app-data` |

### 3.2 后端模块（`server/`）

| 文件 | 职责 |
|------|------|
| `index.ts` | 启动、Vite 中间件（dev）或静态 dist（prod） |
| `routes.ts` | **所有 HTTP API**、权限中间件 |
| `db.ts` | Schema 初始化、迁移、`runTransaction` |
| `auth.ts` | JWT、登录、`UserRole` |
| `access.ts` | 商户读/写权限（admin / leader 团队 / sales 本人） |
| `importParser.ts` | 解析移卡 xlsx |
| `importService.ts` | 导入逻辑、**商户编号优先匹配** |
| `analytics.ts` | 统计、商户列表、**工作台图表聚合** |
| `merchantInsights.ts` | 新沉默 / 下跌中 / 上涨 分类 |
| `insightRules.ts` | 下跌阈值等 admin 可配项 |
| `alertsEngine.ts` | 预警计算、`countAlertsForUser` |
| `followUp.ts` | 跟进记录、附件 |
| `tigerTeam.ts` | Admin 飞虎队 |
| `leaderTeam.ts` | Leader 团队、成员关系表 |
| `paymentChannel.ts` | 刷卡/扫码/Mastercard/境外卡识别 |
| `mastercardRank.ts` | 万事达累计排名 API |
| `overseasCard.ts` | 境外卡概览 API |
| `emailImport/run.ts` | 邮件自动导入（生产未配） |

### 3.3 前端模块（`src/`）

| 文件 | 职责 |
|------|------|
| `App.tsx` | **唯一路由中枢**（`view` state，无 react-router） |
| `config/navigation.ts` | 侧栏项、角色可见性、Leader scope 文案 |
| `components/AppLayout.tsx` | 侧栏 + 主内容区布局 |
| `components/AppShell.tsx` | 页头（标题/subtitle），包在 AppLayout 内 |
| `pages/DashboardPage.tsx` | 三角色工作台入口 |
| `components/AdminDashboardPanel.tsx` | Admin 六块图表 + 排行榜 |
| `components/PersonalDashboardPanel.tsx` | Sales / Leader **本人**图表 |
| `components/DashboardChartsCore.tsx` | 销售/Leader 共用图表 |
| `components/dashboardChartParts.tsx` | 图表 tooltip、排行榜、donut 片段 |
| `pages/LeaderTeamPage.tsx` | Leader **团队**视图 |
| `pages/MerchantsPage.tsx` | 商户列表（insight 筛选、排序） |
| `pages/AdminPage.tsx` | 后台：导入、用户、阈值、开发者主题 |
| `api/client.ts` | 前端 API 类型与 `fetch` 封装 |
| `context/AuthContext.tsx` | 登录态 |
| `context/DevThemeContext.tsx` | Admin 主题（仅 admin 生效） |
| `styles/index.css` | 全局样式（含侧栏、图表、移动端） |

---

## 四、本地开发

```bash
cd /Users/xin/projects/hk.orblead
cp .env.example .env    # 填 JWT_SECRET
npm install
npm run dev             # http://localhost:3080，Vite HMR
npm run build           # dist + dist-server
npm run typecheck       # 前后端 TS 检查
```

### 沙箱（推荐）

```bash
npm run sandbox:open    # → http://localhost:3090，data/sandbox-live.db
```

| 账号 | 密码 | 说明 |
|------|------|------|
| admin | admin123 | 全机构 |
| sam202512 | sales123 | Leader 兼销售测试 |

**沙箱故意行为**：启动时把一半 7 月商户挂到 Winnie，模拟 sam 归属错误 → sam 默认约 29.4 万（非 bug）。append 导入 org 7/1 报表后应 ~52.6 万；**重启沙箱会重置**。

完整数据：复制生产 `app.db` → `data/sandbox-live.db`，`DATABASE_PATH=./data/sandbox-live.db npm run dev`。

### 4.1 零基础首次运行（新电脑）

1. 安装 [Node.js LTS](https://nodejs.org/)（`node -v` / `npm -v` 有输出即可；**无需 Xcode**）
2. 进入项目：`cd /Users/xin/projects/hk.orblead` → `npm install`
3. 配置：`cp .env.example .env`，填 `JWT_SECRET`（至少 32 位）
4. 启动（二选一）：
   - **沙箱（推荐）**：`npm run sandbox:open` → http://localhost:3090
   - **开发模式**：`npm run dev` → http://localhost:3080（勿用 5173，须同一进程带 API）
5. 登录：`admin` / `admin123`；销售测试 `sam202512` / `sales123`
6. 导入：admin → **後臺管理** → 导入机构报表（**append 追加**；勿随便全量 replace 生产数据）
7. 外网上线：见 **`docs/外网部署指南.md`**

| 现象 | 处理 |
|------|------|
| 登录 404 | 必须用 `npm run dev` 或沙箱，地址 **3080/3090** |
| 销售看不到商户 | 检查 Excel **業務員** 列是否与 `users.username` 一致（如 sam202512） |
| 关掉终端网站停了 | 正常；下次再启动 |

> 更详细的零基础图文步骤见 **`docs/archive/新手操作指南.md`**（部分内容已过时，以本文为准）。

---

## 五、角色、权限与界面（方案 B · 2026-07-11 定稿）

### 5.1 角色定义

| role | 数据范围 | 侧栏特点 |
|------|----------|----------|
| `admin` | 全机构 | 飛虎隊、全部商戶、後臺管理 |
| `leader` | 本人 + 团队成员商户 | 我的團隊、我的與團隊商戶 |
| `sales` | 仅本人归属商户 | 我的商戶 |

**Leader 团队关系**：表 `leader_team_members(leader_user_id, sales_user_id)`，后台 admin 维护。

### 5.2 工作台分流（重要）

| 角色 | 页面 | 数据 scope | 组件 |
|------|------|------------|------|
| admin | 工作台 | 全机构 | `AdminDashboardPanel` |
| leader | 工作台 | **本人** | `PersonalDashboardPanel` + scope 文案 |
| leader | 我的團隊 | **团队** | `LeaderTeamPage` → `LeaderDashboardPanel` |
| sales | 工作台 | 本人 | `PersonalDashboardPanel` |

**Leader 易错点**：工作台图表、Hero、统计卡都是**本人**；点 insight 跳转商户列表要带 `salesFilter: "self"`（见 `openMerchants.ts`）。团队票房/成员排名只在「我的團隊」。

### 5.3 侧栏配置

编辑 **`src/config/navigation.ts`** 的 `NAV_ITEMS`：

- 新增入口：加 `NavKey`、图标、`roles` 过滤
- 商户文案：`merchantsNavLabel(role)` → admin 全部 / leader 我的與團隊 / sales 我的
- **`App.tsx`** 同步：`MainView` 类型、`activeNavFromView`、`renderView` switch

### 5.4 前端路由模型（无 react-router）

`App.tsx` 用 `useState<View>` 切换页面，侧栏 `onNavigate` 设置 `{ type: "dashboard" }` 等。

**View 类型**包括：`dashboard`、`merchants`（可带 `viewSort`、`salesFilter`）、`merchant`（下钻，带 `from` 回退）、`tigerTeamSales`、`leaderTeamSales` 等。

**滚动恢复**：列表页进商户详情再返回，用 `sessionStorage` + `mainScroll.ts` 恢复位置。

**下钻页保留「返回」**；侧栏一级页（工作台、列表）无返回按钮。

---

## 六、核心业务指标

### 6.1 Insight 商户分类（与预警不同）

| 指标 | 定义 | 配置 |
|------|------|------|
| **本月 MTD** | 本月 1 日 00:00 ～ 昨日 23:59 交易额 | — |
| **日均环比** | 本月日均 vs 上月日均 % | — |
| **新沉默** | 上月完整月 > 0 且本月 MTD = 0 | — |
| **下跌中** | 本月 MTD > 0 且日均环比 < **-阈值** | admin 可调，默认 **10%** |
| **上涨** | 本月 MTD > 0 且日均环比 > 0 | — |
| **预警跟进** | alerts 表 week/month 未 ack | 阈值默认 **30%**，与下跌中独立 |

逻辑：`server/merchantInsights.ts`；阈值：`server/insightRules.ts` → 表 `insight_settings`。

### 6.2 销售账号与导入

- Excel **`業務員`** 列 → 匹配 **`users.username`**（不是 `display_name`）
- 展示名仅 UI 用（如 Sam）
- 7 人定稿：Winnie202512、sam202512、Char202605、Khloe202606、Alex202604、Ivy202604、JT2026
- 旧账号（如 `sam`）应停用
- 后台 **改登入名**：`PUT /api/users/:id` + `username`；自动 `syncMerchantSalesAssignment()` — **生产启用前与运营确认**

### 6.3 交易额不一致排查（sam202512 等）

| 现象 | 原因 | 修复 |
|------|------|------|
| 看板偏少 vs 机构 Excel | 商户 `sales_user_id` 错或未导入机构报表 | admin **append** 导入 `54516685_機构交易數據報表_*.xlsx`（勿指定销售）→ **同步商户归属** |
| 再导 sam202512.xlsx | 全重复跳过 | **无效**，不要用 |

---

## 七、API 地图（常用）

前缀 **`/api`**，JWT：`Authorization: Bearer`（`AuthContext` 存 localStorage）。

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 公开 | 登录 |
| GET | `/auth/me` | 登录 | 当前用户 |
| GET | `/stats/overview` | 登录 | **工作台总接口**（见 §八） |
| GET | `/leader/team/overview` | leader | 团队页图表 |
| GET | `/leader/team` | leader | 团队成员列表（可 sort） |
| GET | `/leader/team/:id` | leader | 成员详情 |
| GET | `/tiger-team` | admin | 飞虎队列表 |
| GET | `/tiger-team/:id` | admin | 销售详情 |
| GET | `/merchants` | 登录 | 商户列表（role 过滤 + insight） |
| GET | `/merchants/:id` | 登录 | 商户详情 |
| GET | `/merchants/mastercard-ranking` | 登录 | 万事达排名 |
| GET | `/overseas-cards/overview` | 登录 | 境外卡 |
| GET | `/alerts` | 登录 | 预警列表 |
| GET | `/card-failures` | 登录 | 交易失败 |
| POST | `/import/...` | admin | 手工/自动导入 |
| GET/PUT | `/insight-settings/*` | admin | 下跌阈值等 |
| GET/PUT | `/users/*` | admin | 用户、团队、改登入名 |
| POST | `/import/auto` | `X-Import-Key` | 邮件自动导入入口 |

完整列表见 **`server/routes.ts`**（约 1200 行，改 API 先 grep 是否已有）。

---

## 八、工作台数据流（改图表必读）

### 8.1 `GET /stats/overview`（`routes.ts`）

按角色返回不同字段：

| 字段 | admin | leader | sales |
|------|:-----:|:------:|:-----:|
| `merchantCount` | ✅ COUNT | ✅ | ✅ |
| `unreadAlerts` / `totalAlerts` | ✅ COUNT | ✅ | ✅ |
| `adminCharts` | ✅ | — | — |
| `personalCharts` | — | ✅ | ✅ |
| `homeInsight` | — | ✅ | ✅ |
| `alertDigest` | ✅ 周报 | — | — |
| `monthlyStats` / `tigerTeam` / `dailyTrend` | ❌ 已废弃返回 | — | — |

### 8.2 图表聚合函数（`analytics.ts`）

| 函数 | 用途 |
|------|------|
| `getAdminDashboardCharts` | Admin 六图 + 飞虎队榜 + 票房榜 |
| `getPersonalDashboardCharts` | Sales / Leader **本人**四图 |
| `getLeaderDashboardCharts` | Leader **团队**页（含团队 salesRanking） |
| `getAdminDailyMonthCross` | 日交易双线（批量 SQL `queryDailyTotalsMap`） |
| `getAdminMonthCompare` | 自然月环比 |
| `merchantInsightFromList` | 从商户列表算四象限 |
| `merchantBoxOfficeFromList` | 票房榜 Top N |
| `countMerchantsForUser` | 仅计数，不拉全表 |
| `listMerchantsForUser` | 全量列表（**贵**，Admin 图表只调一次） |

**性能选项**：`getMonthlyStats(..., { includeWeeks: false })` — 工作台图表不要每周明细。

### 8.3 Admin 工作台 UI 结构（`AdminDashboardPanel`）

1. 统计卡（预警、商户数、失败）
2. 月度趋势（6 月）
3. 环比柱图 + 商户动态 mini donut
4. 日交易双线（`DailyCrossChartTooltip` 移动端多行）
5. 飞虎队排名 + 商户票房（`HorizontalRankBoard`，`previewLimit={5}`）

---

## 九、数据库要点

SQLite 文件：`DATABASE_PATH`（默认 `./data/app.db`）。

| 表 | 关键字段 |
|----|----------|
| `users` | `username`, `display_name`, `role`, `enabled` |
| `merchants` | `name`, `merchant_code`, `sales_user_id`, `sales_name` |
| `transactions` | `merchant_id`, `txn_time`, `amount`, `order_no`, `pay_wallet`, `batch_id` |
| `import_batches` | 导入批次 |
| `alerts` | `period`, `acknowledged`, 环比消息 |
| `leader_team_members` | leader ↔ sales 归属 |
| `insight_settings` | 下跌阈值、万事达高亮线等 |
| `follow_ups` / `admin_follow_up_reads` | 跟进与已读 |

Schema 与迁移在 **`server/db.ts`** 的 `initSchema()`（启动时执行）。

---

## 十、常见修改场景（AI 操作手册）

### 10.1 新增侧栏页面

1. `navigation.ts`：加 `NavKey` + `NAV_ITEMS` 条目
2. `App.tsx`：`MainView`、`activeNavFromView`、`<AppLayout>` 内 `renderView`
3. 新建 `src/pages/XxxPage.tsx`，用 `AppShell` 包内容
4. 如需 API：`server/routes.ts` + 业务模块 + `api/client.ts` 类型
5. `npm run typecheck`

### 10.2 改工作台图表

1. 后端：改 `analytics.ts` 对应 `get*DashboardCharts`
2. 类型：`src/api/client.ts` 的 `AdminDashboardCharts` / `PersonalDashboardCharts`
3. 前端：`AdminDashboardPanel` 或 `DashboardChartsCore` / `dashboardChartParts`
4. **Recharts tooltip**：默认 `whiteSpace: nowrap` 会截断；用 `CHART_TOOLTIP_STYLE` 或自定义 tooltip（参考 `DailyCrossChartTooltip`）

### 10.3 改 Leader scope 文案

- 常量：`LEADER_PERSONAL_SCOPE_HINT`（`navigation.ts`）
- 页面：`DashboardPage.tsx`、`PersonalDashboardPanel.tsx`、`AlertsPage.tsx`
- 跳转：`onOpenMerchants({ viewSort, salesFilter: "self" })`

### 10.4 改 insight 规则

1. `merchantInsights.ts` 分类逻辑
2. `insightRules.ts` 阈值读写
3. Admin 后台 UI：`AdminPage.tsx` rules section
4. 商户列表展示：`MerchantsPage.tsx`、`MerchantStatusTag.tsx`

### 10.5 改导入逻辑

1. `importParser.ts` 列映射
2. `importService.ts` 商户匹配（**编号优先**）
3. 测：`tools/verify-import-matching.ts`、`tools/verify-org-import-sandbox.ts`

### 10.6 只改样式

- 全局：`src/styles/index.css`
- Admin 主题：`DevThemeContext` + `themeTokens.ts`（**仅 admin**）
- 移动端：搜索 `@media (max-width:` in `index.css`

---

## 十一、2026-07-11 大改版摘要

> 当前生产目标包：`sales-agent-20260711-1749.tgz`

| 类别 | 内容 |
|------|------|
| **导航** | 侧栏替代首页卡包；Sales 移除「摘要」侧栏项 |
| **工作台** | 方案 B；Admin 六图；Leader 本人/团队分离 |
| **新页** | 萬事達排名（≥100万入榜，130万 warn，160万 alert）、境外卡交易 |
| **后台** | 開發者視圖迁入後臺管理；改登入名已有 |
| **性能** | Admin overview 去冗余 SQL；日交易 2 次批量查询；alert COUNT |
| **移动端** | 日交易 tooltip 多行 + `reverseDirection` |
| **打包** | `deploy-pack.sh` 排除 `numbers/` |

---

## 十二、发版

```bash
# Mac 全量
npm run pack:deploy          # → release/sales-agent-YYYYMMDD-HHMM.tgz

# 仅前端
npm run pack:frontend        # → release/sales-dist-*.tgz
```

**服务器**（OrcaTerm）：

```bash
cp /opt/sales-data-agent/.env /tmp/.env.backup
sudo tar xzf sales-agent-XXXX.tgz -C /opt/sales-data-agent
cp /tmp/.env.backup /opt/sales-data-agent/.env
cd /opt/sales-data-agent && sudo docker compose up -d --build
```

⚠️ **禁止** `docker compose restart`（不更新镜像内 dist）。  
⚠️ 解压**不要**覆盖生产 `.env`（含 `JWT_SECRET`）。

详见 **`docs/发版流程.md`**、**`.cursor/rules/deployment.mdc`**。

---

## 十三、邮件自动导入（代码有，生产未开）

| 项 | 值 |
|----|-----|
| 发件人 | `baseweb_report@yeahka.com` |
| 附件名 | `54516685_機构交易數據報表_YYYY-MM-DD.xlsx` |
| 入口 | `POST /api/import/auto` + `X-Import-Key` |
| 脚本 | `server/emailImport/run.ts` |
| Cron | `scripts/install-email-import-cron.sh`（10:25 HKT） |
| 环境变量 | `.env.example` 中 `QQ_IMAP_*`、`IMPORT_API_KEY` 等 |

**当前运营**：手工 append 上传机构报表。

---

## 十四、已知陷阱（勿踩）

| 陷阱 | 正确做法 |
|------|----------|
| Leader 工作台当团队数据改 | 团队数据在 `LeaderTeamPage` / `getLeaderDashboardCharts` |
| Admin 图表多次 `listMerchantsForUser` | 一次列表复用 insight + 票房 |
| Recharts 长 tooltip 手机截断 | 自定义多行 tooltip + `maxWidth` |
| 用个人 xlsx 修 sam 交易额 | append **机构报表** + 同步归属 |
| `restart` 发版 | 必须 `up -d --build` |
| 改登入名未经确认上生产 | 与运营对齐后再开 |
| 提交 `numbers/`、`.env` | deploy-pack 已排除；git 也不要提交 |
| `SalesInsightSummaryPage.tsx` | 侧栏已移除，文件 orphaned，可删可留 |

---

## 十五、待办 / 未上线

- [ ] 生产验证 `sales-agent-20260711-1749.tgz`
- [ ] 7 位销售 username 与業務員一致，旧账号停用
- [ ] 运营 append 最新机构报表
- [ ] 邮件自动导入 `.env` + cron（暂缓）
- [ ] Admin 若仍慢：排行榜懒加载 / 商户聚合纯 SQL

---

## 十六、相关文档

| 文档 | 用途 |
|------|------|
| **本文** | AI / 开发者主交接（**首选**） |
| `docs/README.md` | docs 目录索引 |
| `docs/立得香港看板纪要.md` | 业务备忘、发版记录 |
| `docs/发版流程.md` | 发版 checklist（OrcaTerm 复制粘贴） |
| `docs/外网部署指南.md` | 首次上云、HTTPS、Nginx |
| `docs/archive/` | 已归档旧文档（勿作首选） |
| `.cursor/rules/*.mdc` | Cursor 规则（发版、账号、UI） |

---

## 十七、文档维护

**何时更新本文**：

- 新增侧栏页、角色权限变更
- 工作台 / overview API 结构变化
- 发版后更新 §十一 包名与 §十五 待办
- 新 AI 踩坑后写入 §十四

**发版记录简表**仍写在 `docs/立得香港看板纪要.md` §3.5；本文 §十一 写**架构级**摘要即可。

---

*维护者：发版或架构变更后同步更新「最后更新」日期与 §十一 部署包名。*
