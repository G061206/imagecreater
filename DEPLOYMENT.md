# Prism production deployment

## Requirements

- A VPS with Docker Engine and the Compose plugin
- A domain pointing to the VPS
- Supabase project URL, publishable key, and service-role secret
- A rotated OpenRouter API key

## Configure

1. Copy `app/.env.example` to `app/.env.production` and set the Supabase URL and publishable key.
2. Copy `server/.env.example` to `server/.env` and set server-only secrets.
3. Create a root `.env` containing `SITE_ADDRESS=images.example.com`.
4. In Supabase Auth URL Configuration, set Site URL to the public HTTPS URL and add it to Redirect URLs.

Never put the service-role secret or OpenRouter key in a `VITE_` variable. Rotate the OpenRouter key previously pasted into chat before deployment.

## Deploy

```bash
docker compose build
docker compose up -d
docker compose ps
curl -fsS https://images.example.com/api/health
```

Caddy automatically provisions and renews TLS certificates after DNS resolves and ports 80/443 are reachable.

## Update

```bash
docker compose build app
docker compose up -d app
docker compose logs --tail=200 app
```