# Prism Image Studio

Prism Image Studio 是一个多用户 AI 图像生成工作台。前端使用 React + Vite，后端使用 Express 代理 OpenRouter 图像模型，并通过 Supabase Auth、PostgreSQL/RLS、RPC 和私有 Storage 处理登录、扣费、任务记录、作品库和管理员后台。

## 当前状态

- 前端：React 19 + Vite，包含创作台、生成队列、作品库、账户设置和管理员后台。
- 后端：Express API，所有 OpenRouter 和 Supabase service-role 操作都在服务端完成。
- 数据库：Supabase Auth + public/private schema + RLS + RPC 扣费流程。
- 存储：生成图片写入私有 Supabase Storage bucket，通过短期签名 URL 展示。
- 部署：Docker Compose + Caddy，可部署到 VPS 并自动申请 HTTPS。

## 已实装功能

- 邮箱注册、登录、找回密码、密码恢复和账户资料设置。
- 普通用户与管理员角色隔离。
- 管理员可管理用户角色、套餐、积分、账户状态和模型启停。
- 生成前预扣积分，失败自动退回积分，成功记录供应商成本和生成资产。
- 点击生成后立即在生成队列插入本地任务；后端完成后用真实任务替换，失败则在队列中标记失败。
- 作品库支持搜索、筛选、选择、多选删除和刷新。
- 管理后台包含总览、用户管理、模型中心、API 健康检查、计费汇总和请求日志。
- OpenRouter key 只存在于服务端环境变量，浏览器不会接触密钥。

## 模型调用策略

后端在 `server/src/generation.js` 中按模型 ID 单独构造请求，不再把所有模型混进同一个通用 payload。

| 模型 | Endpoint | 关键逻辑 |
| --- | --- | --- |
| `openai/gpt-image-2` | `/api/v1/images` | 使用 OpenRouter Images API，解析 `data[].b64_json` 或 URL。 |
| `x-ai/grok-imagine-image-quality` | `/api/v1/chat/completions` | 只请求 `modalities: ["image"]`，避免 image+text endpoint 不存在。 |
| `google/gemini-3.1-flash-image` | `/api/v1/chat/completions` | 请求 `modalities: ["image", "text"]`，但当前测试 key/地区返回区域不可用。 |
| `google/gemini-3-pro-image` | `/api/v1/chat/completions` | 同上，当前测试 key/地区返回区域不可用。 |
| `black-forest-labs/flux.1-kontext-max` | `/api/v1/chat/completions` | 保留独立分支，使用 image+text 输出。 |

旧的 `openai/gpt-5.4-image-2` 会在后端自动规范化为 `openai/gpt-image-2`，避免前端缓存旧 ID 时直接失败。线上 Supabase 已启用 `openai/gpt-image-2` 并停用旧 GPT 模型。

## 费用提醒

OpenRouter 图片模型的实际扣费可能和响应里的 `usage.cost` 字段不一致。一次真实 GPT Image 2 测试曾在响应中显示约 `0.007` 美元，但 OpenRouter 控制台实际扣费约 `0.225` 美元。后续验证建议优先做 dry-run 或小预算确认，不要只依赖接口返回的 `usage.cost` 判断账单。

## 项目结构

```text
app/                  React/Vite 前端
server/               Express API、OpenRouter 代理、Supabase service-role 操作
supabase/migrations/  数据库、RLS、RPC、Storage bucket 和模型种子数据
deploy/Caddyfile      Caddy 反向代理与 HTTPS
scripts/dev.mjs       本地前后端开发启动脚本
compose.yaml          VPS 部署编排
```

## 架构

```text
Browser
  | Supabase access token
  v
Express API
  |-- Supabase Auth / PostgreSQL / Storage
  `-- OpenRouter image endpoints
```

生产环境中只有前端公开 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。`SUPABASE_SERVICE_ROLE_KEY` 与 `OPENROUTER_API_KEY` 只能放在 `server/.env` 或 VPS 的服务端环境变量中。

## 本地开发

需要 Node.js 22。

```bash
npm ci
cp .env.example .env
cp server/.env.example server/.env
npm run dev
```

常用脚本：

```bash
npm run dev         # 同时启动 Vite 和 Express
npm run dev:app     # 只启动前端
npm run dev:server  # 只启动服务端
npm run build       # 构建前端
npm run check       # 服务端语法检查 + 前端生产构建
npm start           # 启动 Express 生产服务
```

本地完整生图需要有效的 Supabase 项目、service-role key、OpenRouter key，以及已经执行过的数据库迁移。

## 环境变量

根目录 `.env` 用于 Docker/Caddy 和前端构建：

```env
SITE_ADDRESS=images.example.com
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

`server/.env` 用于服务端：

```env
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
OPENROUTER_API_KEY=sk-or-v1-your-rotated-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MAX_TOKENS=1024
APP_URL=https://images.example.com
APP_NAME=Prism Image Studio
REQUEST_TIMEOUT_MS=180000
MAX_CONCURRENT_GENERATIONS=4
LOG_LEVEL=info
```

不要把 service-role key 或 OpenRouter key 写进任何 `VITE_` 变量。曾经贴到聊天、日志或公开页面里的 OpenRouter key 应立即轮换。

## Supabase 初始化

新 Supabase 项目需要按文件名顺序执行迁移：

```text
supabase/migrations/202606220001_profiles.sql
supabase/migrations/202606220002_harden_profile_security.sql
supabase/migrations/202606220003_generation_pipeline.sql
supabase/migrations/202606220004_profile_update_and_indexes.sql
supabase/migrations/202606220005_consolidate_profile_update_policy.sql
supabase/migrations/202606220006_server_only_admin_updates.sql
supabase/migrations/202606230001_add_grok_imagine_model.sql
supabase/migrations/202606250001_use_gpt_image_2.sql
```

随后在 Supabase Dashboard 中配置：

1. Authentication 启用 Email provider。
2. 生产环境开启邮箱确认，并配置自定义 SMTP。
3. Site URL 设置为生产站点，例如 `https://images.example.com`。
4. Redirect URLs 加入生产站点域名。
5. 建议启用泄露密码保护。

创建首个管理员：先通过网站注册并确认邮箱，然后在 SQL Editor 执行：

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

重新登录后即可进入管理后台。

## VPS 部署

准备一台安装 Docker Engine 与 Docker Compose Plugin 的 Linux VPS，并将域名解析到 VPS 公网 IP。确保 TCP `80/443` 和 UDP `443` 可访问。

```bash
git clone https://github.com/G061206/imagecreater.git
cd imagecreater
cp .env.example .env
cp server/.env.example server/.env
# 编辑 .env 和 server/.env
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS https://images.example.com/api/health
```

健康检查正常返回：

```json
{"status":"ok","database":"ok"}
```

更新版本：

```bash
git pull --ff-only
docker compose build --pull app
docker compose up -d app
curl -fsS https://images.example.com/api/health
```

只修改 `server/.env` 时不需要重建镜像：

```bash
docker compose up -d --force-recreate app
```

## 排障

### `/api/health` 返回 503

检查 `server/.env` 中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，以及 Supabase 项目是否处于健康状态。

### 登录后无法生成

依次检查：

1. OpenRouter key 是否有效且有余额。
2. 用户状态是否为 `active`，积分是否足够。
3. `ai_models` 表中的目标模型是否启用。
4. OpenRouter 当前是否仍支持对应模型 ID、endpoint 和输出模态。
5. `docker compose logs app` 中的供应商错误。

### GPT Image 扣费但没有图片

GPT Image 2 使用模型 ID `openai/gpt-image-2`，必须调用 OpenRouter `/api/v1/images`。返回通常在 `data[].b64_json`。如果部署版本仍走 `/chat/completions`，请更新到包含 GPT Image endpoint 分流和最新模型迁移的版本。

### Grok 返回 output modalities 错误

`x-ai/grok-imagine-image-quality` 需要请求 `modalities: ["image"]`，不要同时请求 `text`。

### Gemini/Nano Banana 返回区域不可用

当前测试中，`google/gemini-3.1-flash-image`、`google/gemini-3-pro-image` 和 `google/gemini-2.5-flash-image` 均在当前 key/请求地区返回 `This model is not available in your region.`。这不是图片解析问题，建议在管理后台停用 Gemini，或换用当前服务器地区可用的供应商模型。

### 点击生成后队列不更新

前端会立即插入 `client-*` 临时任务，并在后端返回后按 `client_request_id` 合并真实任务。如果仍看不到队列项，检查浏览器控制台和 `/api/generations` 请求是否被鉴权拦截。

### 修改前端环境变量后仍是旧配置

根目录 `.env` 中的 `VITE_` 变量在镜像构建阶段写入，需要重新构建：

```bash
docker compose build --no-cache app
docker compose up -d app
```

## 安全说明

- 所有业务表启用 RLS。
- 普通用户只能更新自己的显示名称和头像。
- 角色、套餐、积分和账户状态只能通过管理员服务端接口修改。
- 生成图片所在 Storage bucket 为私有桶。
- 服务端容器使用非 root 用户运行，并启用只读文件系统。
- 定期轮换 OpenRouter 和 Supabase 服务端密钥。

## License

当前仓库尚未声明开源许可证。公开仓库不等于允许复制、修改或再分发。
