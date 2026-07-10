# 商户交易监控 Agent

帮助销售团队掌握**名下商户**的交易变化：同一商户的交易名称、时间、明细，并按**日 / 周 / 月**对比；当环比下降超过阈值（默认 30%）时自动预警。

面向场景：

- 销售在家、户外通过**浏览器**查看自己的商户（外网可访问）
- **无支付公司 API**：由管理员从上游后台导出 CSV / Excel，定期上传
- 按「销售/业务员」列自动分配商户归属

## 功能

| 角色 | 能力 |
|------|------|
| 销售 | 登录后仅看本人商户、预警、交易明细、日/周/月趋势 |
| 管理员 | 上传全量交易文件、配置日/周/月预警阈值、管理数据 |

## 导入文件格式

从上游后台导出 **CSV / XLS / XLSX**，至少包含：

| 列 | 说明 |
|----|------|
| 商户名称 | 必填 |
| 交易名称 | 必填 |
| 交易时间 | 必填 |
| 交易金额 | 必填 |
| 交易明细 | 可选 |
| 销售 / 业务员 | 强烈建议（与系统销售姓名一致，如「张明」） |

中英文表头均可，见 `public/samples/transactions.csv`。

## 本地开发

```bash
cd /Users/Eric/projects/sales-data-agent
npm install
npm run db:seed    # 初始化账号 + 样例数据
npm run dev        # 浏览器打开 http://localhost:3080
```

- 打开 http://localhost:5173  
- 管理员 `admin` / `admin123` → **数据管理** 上传文件  
- 销售 `zhangming` / `sales123` → 仅看张明名下商户  

## 生产部署（外网给全体销售使用）

### 方式一：Docker（推荐）

```bash
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET

npm run build
docker compose up -d --build
```

生产镜像使用 **`Dockerfile.prod`**（Mac 上 build，服务器不编译）。  
一键打部署包：`npm run pack:deploy` → 输出到 `release/`。

访问 `http://服务器IP:3080`。前面加 **Nginx + HTTPS**（Let's Encrypt）即可给销售发域名，例如 `https://sales.yourcompany.com`。

项目结构见 **[docs/项目结构.md](docs/项目结构.md)**。  
发版步骤见 **[docs/发版流程.md](docs/发版流程.md)**（Mac 打包 → OrcaTerm 解压 → `docker compose up -d --build`）。

### 方式二：云服务器手动部署

```bash
npm install
npm run build
export JWT_SECRET=你的随机密钥
export PORT=3080
npm run db:seed
npm start
```

将 80/443 反向代理到 `127.0.0.1:3080`。

### 销售账号（管理员网页）

登录 **admin** → **数据管理** → **销售账号**：添加用户名/显示名/密码，导入数据后点 **同步商户归属**。  
显示名须与智付文件名或表内销售一致（如 `JasonLee`）。

### 外网部署

销售在户外用手机访问，见 **[docs/外网部署指南.md](docs/外网部署指南.md)**（云服务器 + Docker + HTTPS）。

### 运维建议

1. **定期导入**：建议每周/每日由运营从上游后台导出全量文件，管理员在「数据管理」选择**全量替换**上传。  
2. **销售账号**：在「数据管理 → 销售账号」维护，勿只靠 seed 演示账号。  
3. **安全**：务必修改 `JWT_SECRET`、使用 HTTPS、设置强密码。  
4. **备份**：备份 `data/app.db`（SQLite 文件）。

## 预警规则

默认：日 / 周 / 月环比**下降 ≥ 30%** 触发预警。  
管理员在「数据管理」中可分别修改，例如「月环比下降 30%」「周环比下降 25%」。

## 技术栈

- 前端：React + Vite  
- 后端：Express + SQLite + JWT  
- 解析：SheetJS（xlsx）支持 CSV / Excel  

## 默认账号（seed 后）

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| zhangming | sales123 | 销售（张明） |
| lifang | sales123 | 销售（李芳） |

生产环境请立即修改密码。
