# Deployment — [APP_NAME]

This release is a **development / demo build** with mock integrations. The steps below describe how to run it and what must change before any environment holds real patient data. Nothing here is certified; see [COMPLIANCE.md](COMPLIANCE.md) and [SECURITY.md](SECURITY.md).

## 1. Components

| Component | Build output | Runtime |
|---|---|---|
| API | `server/dist` (`npm run build -w server`) | Node.js 22, `node dist/index.js` from `server/`, listens on `PORT` (4000) |
| Web client | `client/dist` (static files, `npm run build -w client`) | Any static server; must be on the **same site** as the API (cookies are `SameSite`), with `/api/*` proxied to the API |
| Database | Prisma migrations in `server/prisma/migrations` | PostgreSQL 16 |
| File storage | — | `STORAGE_PROVIDER=local` (private directory) in this release; S3 adapter is a stub |
| Background work | Notification retry worker runs inside the API process (`NOTIFICATION_WORKER_INTERVAL_MS`, `0` disables) | Run it in exactly one instance per environment, or disable it on extra replicas |

## 2. Environment variables

All variables are validated at start-up (`server/src/config/env.ts`); the process exits with a clear message when one is invalid. `.env.example` lists them with safe defaults and **no secrets**.

| Variable | Default | Production guidance |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `4000` | — |
| `LOG_LEVEL` | `info` | `info` or `warn` |
| `APP_NAME` | `[APP_NAME]` | Your brand |
| `APP_BASE_URL` | `http://localhost:5173` | Public HTTPS URL of the web app (used in secure links) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated exact web origins |
| `DATABASE_URL` | — (required) | Least-privilege role, `sslmode=require` |
| `AUTH_SECRET` | — (required, ≥ 32 chars) | From a secret manager; unique per environment |
| `ACCESS_TOKEN_TTL_MINUTES` / `REFRESH_TOKEN_TTL_DAYS` | 15 / 7 | Keep short |
| `COOKIE_SECURE` | `true` in production | Must be `true` behind HTTPS |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS` | 10 / 60000 | Per IP + email |
| `API_RATE_LIMIT_MAX` | 1200 per minute | Per IP; in-memory per process |
| `LOCKOUT_THRESHOLD` / `LOCKOUT_MINUTES` | 5 / 15 | — |
| `SMS_PROVIDER`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_DLT_ENTITY_ID` | `mock` | DLT-registered provider (adapter to implement) |
| `WHATSAPP_PROVIDER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE_LANGUAGE` | `mock` | Official WhatsApp Business Platform (`cloud_api`) only |
| `EMAIL_PROVIDER`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM` | `mock` | Transactional provider |
| `STORAGE_PROVIDER` | `local` | `s3` once implemented; otherwise an encrypted private volume |
| `STORAGE_LOCAL_DIR` | `./var/storage` (relative to repo root) | Absolute path on a persistent, backed-up, non-web-served volume |
| `STORAGE_BUCKET` | — | For `s3` |
| `UPLOAD_MAX_BYTES` | 10485760 | Keep proxy body limit ≥ this |
| `DOWNLOAD_URL_TTL_SECONDS` | 300 | Short |
| `SECURE_LINK_TTL_HOURS` | 72 | — |
| `PAYMENT_PROVIDER`, `HEALTH_DATA_PROVIDER`, `TELECONSULT_PROVIDER`, `FHIR_PROVIDER`, `ABDM_PROVIDER` | `mock` | Only `mock` exists in this release |
| `NOTIFICATION_MAX_ATTEMPTS` / `NOTIFICATION_RETRY_BASE_SECONDS` / `NOTIFICATION_WORKER_INTERVAL_MS` | 3 / 30 / 15000 | — |
| `DEMO_MODE` | `true` outside production | `false` only for real use (removes demo banners/watermarks) |
| `ENABLE_TEST_ROUTES` | `false` | Must stay `false`; the API refuses to start with it in production |
| `SEED_DEMO_PASSWORD` | `Demo@12345` | Development seed only |

## 3. Local / demo with Docker Compose

```bash
cp .env.example .env
# set AUTH_SECRET, e.g.  openssl rand -base64 48
docker compose up -d postgres                  # database only (for npm run dev)
docker compose --profile app up -d --build     # database + migrate + API + web on http://localhost:8080
docker compose --profile app run --rm migrate  # re-run migrations
```

The `app` profile builds the multi-stage `Dockerfile` targets:

| Target | Contents |
|---|---|
| `migrate` | Full toolchain; runs `prisma migrate deploy` then exits |
| `api` | Production dependencies + compiled server, runs as the non-root `node` user, `HEALTHCHECK` on `/api/health` |
| `web` | nginx serving `client/dist` with SPA fallback, security headers and `/api/` proxied to `api:4000` (`deploy/nginx.conf`) |

Seed demo data (fictional, **destructive**) into the compose database from the host with `npm run db:seed` while `DATABASE_URL` points at it. Never seed a shared or production database.

> The compose `api` service sets `COOKIE_SECURE=false` so the demo works on plain `http://localhost`. Any shared environment must be served over HTTPS with `COOKIE_SECURE=true`.

**Verification status:** the Dockerfile and nginx config were written for this release but could not be built in the authoring environment (container registry access was blocked). The equivalent production start (`NODE_ENV=production node server/dist/index.js`) was verified: readiness check OK, test routes absent, and start-up refused when `ENABLE_TEST_ROUTES=true`. Build the images once in your own environment before relying on them.

## 4. Manual deployment (VM / PaaS)

```bash
npm ci
npm run db:generate
npm run build                           # server/dist + client/dist
npm run db:deploy                       # apply migrations (see §5)
cd server && NODE_ENV=production node dist/index.js
```

Serve `client/dist` from the same origin as the API, e.g. with the nginx config in `deploy/nginx.conf` (change `proxy_pass` to the API address). The API trusts exactly one proxy hop (`trust proxy = 1` in production), so put exactly one reverse proxy in front or adjust `app.ts`.

Process management: run under systemd, a container orchestrator or a PaaS with restart-on-failure. The process handles `SIGTERM` (drains HTTP, stops the worker, disconnects Prisma; forced exit after 10 s).

## 5. Database migrations

- Normal path: `npm run db:deploy` (= `prisma migrate deploy`). Run it as a separate release step **before** starting new API instances.
- Restricted networks (Prisma engine download blocked): `npm run db:migrate:offline -w server` applies the same SQL files through node-postgres and records them in `_prisma_migrations` with Prisma's checksum format.
- Migration `20260926000100_db_safeguards` installs the partial unique index for slot booking, append-only triggers on `AuditLog` and `NotificationConsent`, immutability of `PrescriptionVersion`, and CHECK constraints. The application role must **not** be able to drop or disable these triggers; run migrations with a separate owner role and grant the app role only DML.
- Never run `db:reset` or `db:seed` outside development.

## 6. Backups and restore

| Item | Guidance |
|---|---|
| PostgreSQL | Managed PITR or `pg_basebackup` + WAL archiving; daily logical dumps (`pg_dump -Fc`) kept encrypted, off-site, in India if required |
| File storage | Snapshot the storage volume / bucket versioning, same retention as the DB |
| Consistency | Documents reference storage keys; back up DB and storage together |
| Restore test | At least quarterly: restore to an isolated environment, run `GET /api/health/ready`, open a prescription PDF and a document, verify audit-log continuity |
| Retention | Follow the operator's record-retention policy (see COMPLIANCE.md); audit logs ≥ 1 year |

Restore example: `pg_restore -d <empty_db> --no-owner backup.dump`, then restore the storage directory, then start the API.

## 7. Observability

- Logs: pino JSON to stdout, URLs without query strings, sensitive fields redacted. Ship to a SIEM; alert on `auth.refresh_reuse_detected`, `patient.break_glass`, spikes in `access.denied` and 5xx.
- Health: `GET /api/health` (liveness), `GET /api/health/ready` (DB + providers; restrict to internal networks), `GET /api/health/metrics` (requires `report:operational`; per-process counters).
- Request IDs: `X-Request-Id` is accepted/propagated and returned on every response.

## 8. Scaling notes

- The API is stateless apart from: in-memory rate-limit store (use a shared store with multiple replicas), the notification worker (run once), and `local` storage (use shared storage or S3).
- Booking correctness across replicas is enforced by the database index, not by process memory.

## Go-live checklist

- [ ] Legal, clinical-governance and regulatory review complete ([COMPLIANCE.md §8](COMPLIANCE.md)).
- [ ] `NODE_ENV=production`, `DEMO_MODE=false`, `ENABLE_TEST_ROUTES=false`, `COOKIE_SECURE=true`.
- [ ] `AUTH_SECRET` and provider credentials from a secret manager; `.env` files not deployed from git.
- [ ] HTTPS with HSTS, single trusted proxy hop, `CORS_ORIGINS` and `APP_BASE_URL` set to production HTTPS origins.
- [ ] Database: TLS, private network, separate migration-owner and app roles, encryption at rest, backups and a tested restore.
- [ ] Storage: private, encrypted, backed up; malware scanning on upload.
- [ ] Real providers implemented, DLT templates registered, WhatsApp templates approved, delivery webhooks with signature checks.
- [ ] MFA for staff; shared rate-limit store; WAF.
- [ ] SIEM alerts, on-call, incident-response and breach-notification runbook.
- [ ] Penetration test done and findings fixed; dependency and image scanning in CI.
- [ ] Demo data never loaded; demo accounts absent.
