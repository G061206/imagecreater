# Supabase setup

完整配置说明见 [README.md](README.md#3-配置-supabase-数据库)。

新项目需要按文件名顺序执行 `supabase/migrations/` 下的全部 SQL 迁移，而不是只执行第一条。随后配置 Email provider、生产 Site URL、Redirect URLs 和 SMTP。

浏览器只能使用 publishable key。`SUPABASE_SERVICE_ROLE_KEY` 必须仅保存在 VPS 的 `server/.env` 中。