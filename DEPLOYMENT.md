# Production deployment

完整部署指南、环境变量说明、Supabase 初始化、HTTPS、升级和排障步骤统一维护在 [README.md](README.md#vps-部署)。

最短启动流程：

```bash
cp .env.example .env
cp server/.env.example server/.env
# 编辑两个文件后：
docker compose build --pull
docker compose up -d
curl -fsS https://your-domain.example/api/health
```