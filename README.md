# Prism Image Studio

Prism 是一个面向多用户的 AI 图像生成平台，界面参考 Google Flow。项目包含 Supabase Auth、PostgreSQL/RLS、管理员后台、OpenRouter 服务端代理、生成额度、私有图片存储，以及可直接部署到 VPS 的 Docker Compose + Caddy 配置。

## 功能

- 邮箱注册、登录、密码找回和账户资料管理
- 普通用户与管理员权限隔离
- GPT Image 2、Nano Banana 等 OpenRouter 图像模型
- 比例、分辨率、品质、数量、负面提示词和随机种子
- 生成前额度预扣，失败自动退款
- 生成任务、供应商请求和成本记录
- 图片写入私有 Supabase Storage，通过短期签名 URL 访问
- 管理员管理角色、套餐、额度和账户状态
- Caddy 自动申请和续期 HTTPS 证书

## 架构

```text
Browser
  | Supabase access token
  v
Caddy (HTTPS)
  v
Express API
  |-- Supabase Auth / PostgreSQL / Storage
  `-- OpenRouter image models
```

OpenRouter key 和 Supabase service-role secret 只存在于 VPS 的 `server/.env`。浏览器只能获得 Supabase publishable key。

## VPS 部署

### 1. 准备条件

- 一台安装了 Docker Engine 和 Docker Compose Plugin 的 Linux VPS
- 一个已解析到 VPS 公网 IP 的域名，例如 `images.example.com`
- Supabase 项目 URL、publishable key 和 service-role secret
- OpenRouter API key
- VPS 的 TCP `80`、`443` 端口和 UDP `443` 端口可访问

Docker 安装请使用 [Docker 官方安装文档](https://docs.docker.com/engine/install/)。建议 Ubuntu 22.04/24.04、Debian 12 或同等环境，至少 1 核 CPU、1 GB 内存。

### 2. 拉取项目

```bash
git clone https://github.com/G061206/imagecreater.git
cd imagecreater
```

### 3. 配置 Supabase 数据库

新 Supabase 项目需要在 SQL Editor 中按文件名顺序执行：

```text
supabase/migrations/202606220001_profiles.sql
supabase/migrations/202606220002_harden_profile_security.sql
supabase/migrations/202606220003_generation_pipeline.sql
supabase/migrations/202606220004_profile_update_and_indexes.sql
supabase/migrations/202606220005_consolidate_profile_update_policy.sql
supabase/migrations/202606220006_server_only_admin_updates.sql
```

本仓库当前关联的新加坡 Supabase 项目已经执行过这些迁移。更换项目时才需要重新执行。

在 Supabase Dashboard 完成以下设置：

1. 在 Authentication 中启用 Email provider。
2. 生产环境保持邮箱确认开启，并配置自定义 SMTP。
3. 将 Authentication URL Configuration 的 Site URL 设置为 `https://images.example.com`。
4. 将 `https://images.example.com` 加入 Redirect URLs。
5. 建议在 Authentication 的密码安全设置中启用泄露密码保护。

### 4. 配置前端公开变量

```bash
cp .env.example .env
nano .env
```

```env
SITE_ADDRESS=images.example.com
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

`SITE_ADDRESS` 只写域名，不要带 `https://` 或路径。`VITE_SUPABASE_ANON_KEY` 可以填写 Supabase 当前推荐的 publishable key。

### 5. 配置服务端密钥

```bash
cp server/.env.example server/.env
nano server/.env
```

至少修改：

```env
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
OPENROUTER_API_KEY=sk-or-v1-your-rotated-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
APP_URL=https://images.example.com
APP_NAME=Prism Image Studio
REQUEST_TIMEOUT_MS=180000
MAX_CONCURRENT_GENERATIONS=4
LOG_LEVEL=info
```

注意：

- 不要把 `SUPABASE_SERVICE_ROLE_KEY` 或 `OPENROUTER_API_KEY` 写入任何 `VITE_` 变量。
- `.env` 和 `server/.env` 已被 Git 忽略，不要强制提交。
- 曾经粘贴到聊天、日志或公开页面的 OpenRouter key 必须先轮换。

### 6. 启动

```bash
docker compose build --pull
docker compose up -d
docker compose ps
```

查看日志：

```bash
docker compose logs -f --tail=200 app
docker compose logs -f --tail=100 caddy
```

验证：

```bash
curl -fsS https://images.example.com/api/health
```

正常返回：

```json
{"status":"ok","database":"ok"}
```

健康检查验证应用与 Supabase 数据库连接。OpenRouter 连接可在管理员后台的“API 配置”页面检查，或登录后实际生成一张图片。

### 7. 创建管理员

先通过网站注册并完成邮箱确认，然后在 Supabase SQL Editor 执行：

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@example.com';
```

重新登录后，账户菜单会显示管理员后台。

## 更新版本

```bash
git pull --ff-only
docker compose build --pull app
docker compose up -d app
docker compose ps
curl -fsS https://images.example.com/api/health
```

只修改 `server/.env` 时不需要重新构建：

```bash
docker compose up -d --force-recreate app
```

## 备份与恢复

业务数据和生成图片位于 Supabase，不在 VPS 容器内。部署前建议：

- 在 Supabase 配置数据库备份策略
- 定期备份 `public` schema 和 Storage 对象
- 安全保存 `.env`、`server/.env` 和域名 DNS 配置

Caddy 证书数据存放在 Docker volume `caddy_data`，即使重建应用容器也不会丢失。

## 常见问题

### 网站打不开

确认 DNS 已解析、VPS 防火墙开放 `80/443`，然后检查：

```bash
docker compose ps
docker compose logs --tail=200 caddy
docker compose logs --tail=200 app
```

### `/api/health` 返回 503

检查 `server/.env` 中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，以及 Supabase 项目是否处于 ACTIVE_HEALTHY 状态。

### 登录后无法生成

依次检查：

1. OpenRouter key 是否有效且有余额。
2. 用户状态是否为 `active` 且积分足够。
3. `ai_models` 表中的模型是否启用。
4. OpenRouter 当前是否仍提供对应模型 ID。
5. `docker compose logs app` 中的供应商错误。

### 修改 `.env` 后前端仍是旧配置

根目录 `.env` 中的 `VITE_` 变量是在镜像构建阶段写入的，必须重新构建：

```bash
docker compose build --no-cache app
docker compose up -d app
```

### Caddy 无法签发证书

确认域名已指向当前 VPS、`80/443` 未被其他服务占用，并检查 Caddy 日志。DNS 刚修改时需要等待解析生效。

## 本地校验

安装 Node.js 22 后执行：

```bash
npm ci
npm run check
```

`npm run check` 会检查服务端语法并生成前端生产构建。本地完整运行仍需要有效的 Supabase 与 OpenRouter 服务端环境变量。

## 安全说明

- 所有公开表均启用 RLS。
- 普通用户只能更新自己的昵称和头像。
- 角色、套餐、额度和账户状态只能通过管理员服务端接口修改。
- 生成图片所在 Storage bucket 为私有桶。
- 服务端容器以非 root 用户运行，并使用只读文件系统。
- 请定期轮换 OpenRouter 和 Supabase 服务端密钥。

## License

当前仓库尚未声明开源许可证。公开仓库不等于允许复制、修改或再分发。