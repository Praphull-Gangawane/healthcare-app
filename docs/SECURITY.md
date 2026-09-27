# Security — [APP_NAME]

This document describes what the code does today. It is not a certification or a penetration-test report. File references are relative to the repository root.

## 1. Threat model summary

Assets: patient identity and contact data, clinical records (notes, diagnoses, vitals, prescriptions, lab results, documents), credentials/sessions, audit trail, billing records.

| Actor / vector | Main threats | Primary controls |
|---|---|---|
| Anonymous internet user | Credential stuffing, account enumeration, scraping public directory, DoS | Login rate limit (IP + email), lockout, generic login errors + dummy bcrypt compare, global API rate limit, public endpoints expose no patient data |
| Signed-in patient | Reading other patients' records (IDOR), escalating to staff functions | Per-request principal, `portal:self` + self/proxy checks on every patient-scoped call, 404 for foreign resources, secure links bound to the signed-in patient |
| Caregiver / proxy | Over-broad access to an adult's records | Adult proxies PENDING until staff verify; `APPOINTMENTS_ONLY` level; revocation; expiry (`validUntil`) |
| Staff member | Browsing records without a care relationship, cross-facility or cross-organisation access | Permission gate + ABAC (care relationship / facility scope / break-glass with reason), organisation isolation, audit of every clinical access and denial |
| Browser attacker (XSS/CSRF) | Session theft, forged state changes | httpOnly cookies, CSRF double-submit header, SameSite=Lax, strict API CSP, JSON-only API |
| Malicious file upload | Malware/polyglot files, path traversal, content sniffing | Allow-list + magic-byte check, size limit, server-generated storage keys, sandboxed download headers |
| Messaging channel | Health data leaking via SMS/WhatsApp, link guessing | Minimal-content templates, random hashed expiring secure links requiring login |
| Insider / DB access | Tampering with audit or finalized prescriptions | Append-only triggers, immutable prescription versions + content hash, correction rows instead of updates |
| Concurrency / replay | Double booking, duplicate payments/finalization | Partial unique index + seat loop, compare-and-set transitions, idempotency keys |

## 2. Controls implemented

| Area | Control | Where |
|---|---|---|
| Passwords | bcrypt cost 12; policy 10–128 chars with upper, lower, digit; dummy compare for unknown users | `server/src/services/auth/passwords.ts` |
| Login protection | `loginLimiter` 10/min per IP + email; lockout after `LOCKOUT_THRESHOLD` (5) failures for `LOCKOUT_MINUTES` (15); disabled accounts return the same error as bad passwords; all outcomes audited | `middleware/rateLimit.ts`, `services/auth/auth.service.ts` |
| Sessions | JWT HS256 (15 min, issuer/audience checked, algorithm pinned) + server-side `Session` row checked on every request; refresh token (random 32 bytes, stored as SHA-256) rotated on each use; reuse of a revoked refresh token revokes all sessions; password change and deactivation revoke all sessions | `services/auth/tokens.ts`, `auth.service.ts`, `middleware/auth.ts` |
| Cookies | `cf_at` / `cf_rt` httpOnly, `cf_rt` path-scoped to `/api/auth`, SameSite=Lax, `Secure` via `COOKIE_SECURE` (default true in production) | `routes/auth.routes.ts` |
| CSRF | Double-submit: `X-CSRF-Token` must equal `cf_csrf` for cookie-authenticated unsafe methods | `middleware/auth.ts` |
| Authorization | Route permission gate (denials audited); patient ABAC (self, proxy, care relationship, facility scope, break-glass); organisation isolation (foreign patient → 404); ownership rules for encounters/prescriptions; facility scope for staff | `config/rbac.ts`, `middleware/auth.ts`, `services/access/patientAccess.ts`, services |
| Break-glass | `clinical:break_glass` + `X-Access-Reason` ≥ 10 chars; audited `patient.break_glass` with reason | `patientAccess.ts`, `routes/patients.routes.ts` |
| Input validation | zod schemas for every body/query; 1 MB JSON limit; ids restricted to `[A-Za-z0-9_-]{1,64}` | `validators/*`, `lib/http.ts`, `app.ts` |
| SQL injection | Prisma parameterised queries; raw SQL only via tagged templates (`$queryRaw`) | `lib/ids.ts`, `app.ts` |
| Security headers | helmet: CSP `default-src 'none'; frame-ancestors 'none'`, CORP same-site, HSTS (production), no `x-powered-by` | `app.ts` |
| CORS | Explicit origin allow-list with credentials | `app.ts`, `CORS_ORIGINS` |
| Error handling | Stable codes, generic messages, no stack traces to clients; 5xx logged with request id | `middleware/errorHandler.ts`, `lib/errors.ts` |
| File uploads | PDF/PNG/JPEG only; declared MIME + extension + magic bytes must match; empty files rejected; `UPLOAD_MAX_BYTES` (10 MB) enforced by multer and service; single file; filename sanitised (NFKC, control chars stripped, basename only) | `services/document.service.ts`, `routes/documents.routes.ts`, `routes/investigations.routes.ts` |
| File storage | Keys `patients/<id>/<uuid>` generated server-side; key regex + path-containment check; dirs 0700, files 0600, write-once | `providers/storage/local.ts` |
| File download | Authorise → short-lived (300 s) HMAC-signed URL bound to the user → re-authorise on download; `no-store`, `nosniff`, `CSP: default-src 'none'; sandbox`, attachment disposition; URL issue + access audited | `document.service.ts`, `lib/crypto.ts` |
| Secure links | 24 random bytes, SHA-256 at rest, expiry (72 h), max uses (5), requires signed-in patient/proxy | `services/secureLink.service.ts` |
| Messaging content | No clinical details in templates; message bodies not persisted; variables hidden from delivery-log listings | `services/notifications/templates.ts`, `routes/notifications.routes.ts` |
| Consent | Opt-in only, append-only history, re-checked before every send attempt | `notifications/consent.service.ts`, `notification.service.ts` |
| Audit trail | Append-only `AuditLog` (DB trigger) with actor, roles, org, action, resource, outcome, reason, minimal before/after, IP, user agent, request id; failures to audit inside a transaction abort the transaction | `services/audit.service.ts`, migration `db_safeguards` |
| Record integrity | Prescription versions immutable (trigger) with SHA-256 content hash printed on the PDF; vitals/lab results corrected via new rows; notes finalised + addenda | `prescription.service.ts`, `vital.service.ts`, `investigation.service.ts`, `encounter.service.ts` |
| Concurrency | Partial unique slot index, compare-and-set status updates, optimistic `version` on encounters, idempotency records | `appointment.service.ts`, `middleware/idempotency.ts` |
| Teleconsult | No public meeting links; participant-bound 10-minute signed join tokens; consent before first patient join | `services/teleconsult.service.ts`, `providers/teleconsult/mock.ts` |
| Test surface | `/api/test/*` only with `ENABLE_TEST_ROUTES=true`; startup fails if enabled with `NODE_ENV=production` | `config/env.ts`, `app.ts` |
| Config safety | zod-validated environment; `AUTH_SECRET` ≥ 32 chars; real providers require their credentials at start-up | `config/env.ts`, `providers/index.ts` |
| Graceful shutdown | SIGTERM/SIGINT close HTTP server and DB pool (10 s timeout) | `server/src/index.ts` |

## 3. Logging and redaction policy

- Logger: pino JSON (`server/src/lib/logger.ts`); request logs contain method and path **without query string**; `/api/health` is not logged.
- Redacted paths (`[REDACTED]`): `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-csrf-token"]`, `res.headers["set-cookie"]`, and any first-level-nested `password`, `newPassword`, `currentPassword`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `otp`, `apiKey`, `body`, `content`.
- Policy for new code: log identifiers (user id, patient id, appointment id, request id), never names, contact details, clinical text, file contents, tokens or OTPs. Audit entries store identifiers and minimal diffs only.
- Note: pino redaction paths with `*.` match one nesting level; deeper structures must not be logged.

## 4. Secrets management

| Secret | Used for | Guidance |
|---|---|---|
| `AUTH_SECRET` | JWT signing, download-URL and join-token HMAC | ≥ 32 random chars (`openssl rand -base64 48`); unique per environment; rotating it invalidates all sessions and outstanding URLs |
| `DATABASE_URL` | PostgreSQL | Least-privilege app role; TLS (`sslmode=require`) in production |
| `SMS_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `EMAIL_API_KEY` | Providers | Store in a secret manager; never in `.env` committed to git (`.gitignore` ignores `.env*` except `.env.example`) |
| `SEED_DEMO_PASSWORD` | Seed only | Development only; never seed shared/production databases |

`.env.example` contains no secrets. CI generates a throwaway `AUTH_SECRET` per job and masks it.

## 5. Not implemented / known gaps

| Item | Status | Notes |
|---|---|---|
| MFA (TOTP/WebAuthn/OTP) | Not implemented — extension point only | `services/auth/mfa.ts` (`NotConfiguredMfaProvider`); `User.mfaEnabled` unused |
| S3 / object storage adapter | Stub | `integrations/storage/s3CompatibleProvider.ts` throws `PROVIDER_UNAVAILABLE` |
| Encryption at rest | Depends on infrastructure | No application-level field encryption; use encrypted volumes/managed DB encryption and bucket SSE |
| WAF / bot protection | Not implemented | Place behind a WAF/CDN |
| SIEM / alerting | Not implemented | Ship pino logs and audit exports to a SIEM |
| Distributed rate limiting | Not implemented | In-memory store per process; use a shared store (e.g. Redis) when running replicas |
| Provider webhooks (delivery receipts) | Not implemented | Receipts only via the test route; a signed webhook endpoint is needed for WhatsApp/SMS |
| Digital signature for prescriptions | Not implemented | Session attestation only (`providers/signing/sessionAttestation.ts`) |
| Antivirus scanning of uploads | Not implemented | Add ClamAV/cloud scanning before making files available |
| Password breach check / history | Not implemented | |
| Account recovery (forgot password) | Not implemented | No endpoint exists |
| Data retention enforcement | Not implemented | `RetentionPolicy` rows are configuration placeholders only |

### Review findings and status

| # | Finding | Status |
|---|---|---|
| F1 | `POST /api/vitals/:vitalId/correct` checked only `vital:write`. | **Fixed** — loads the vital's patient and calls `assertPatientAccess(…, 'clinical')` (`routes/clinical.routes.ts`). |
| F2 | `POST /api/health-data/readings/:readingId/promote` checked only `vital:write`. | **Fixed** — same patient-level check (`routes/misc.routes.ts`). |
| F3 | Login limiter keyed on raw `req.ip` (IPv6 rotation within a /64). | **Fixed** — key is `ipKeyGenerator(ip)` + normalised email (`middleware/rateLimit.ts`). |
| F4 | `POST /api/auth/refresh` is not CSRF-protected. | **Accepted for now** — refresh cookie is `SameSite=Lax`, path-scoped to `/api/auth`, rotates on use with reuse detection. Revisit if cross-site embedding is ever required. |
| F5 | `/api/health/metrics` was public. | **Fixed** — requires authentication and `report:operational`. |
| F6 | Unknown-email logins compared against a cost-4 dummy hash while real hashes use cost 12, so response time could reveal whether an account exists. | **Fixed** — dummy hash uses the same cost (`services/auth/passwords.ts`). |
| F7 | `toPage()` spread the whole parsed query into service arguments, overwriting converted `from`/`to` dates with raw strings (500 on `GET /api/appointments?from=&to=`). | **Fixed** — returns paging fields only (`validators/common.ts`); covered by an API test. |

## 6. File upload security (summary)

1. multer memory storage, `fileSize = UPLOAD_MAX_BYTES`, `files = 1` (`fields = 10` on `/api/documents`).
2. `validateUpload`: non-empty; size; sanitised filename; extension must match declared MIME (`application/pdf → .pdf`, `image/png → .png`, `image/jpeg → .jpg/.jpeg`); `file-type` magic-byte detection must equal the declared MIME.
3. Stored under a random key; original filename kept as metadata only; SHA-256 and size recorded.
4. Patient uploads are forced to type `PATIENT_UPLOAD`, visibility `PATIENT_VISIBLE`.
5. Served only through the two-step authorised download with sandboxing headers.

## 7. Security testing

| Layer | What to cover | Where |
|---|---|---|
| Unit (vitest) | Money math, vital validation/flags, appointment transitions, filename sanitisation, secure-link/HMAC helpers | `server/test/unit/` |
| API (Playwright request) | 401 without token; 403 CSRF; RBAC matrix per role; IDOR (patient A → patient B = 403/404); cross-facility (`reception.lakeview`) and cross-org; break-glass requires reason; rate limit 429; lockout 423; idempotency replay/reuse; upload rejects (renamed EXE, oversize, MIME mismatch); download URL bound to user/expiry; secure link other patient = 403; test routes absent when disabled | `tests/api/**` |
| E2E | Session expiry handling, logout clears cookies, no patient names on queue display | `tests/specs/**` |
| Static | ESLint (`no-explicit-any`, `eqeqeq`, `no-console`), TypeScript strict, SonarQube (`sonar-project.properties`), `npm audit` | CI |
| Recommended before production | External penetration test (OWASP ASVS L2), dependency scanning (Dependabot/Snyk), secret scanning, DAST (OWASP ZAP) against staging | — |

## 8. Responsible disclosure

Placeholder — to be completed by the operating organisation: security contact (`security@<domain>`), PGP key, expected response time, safe-harbour statement, and scope. Until then, report issues privately to the repository owners; do not open public issues containing vulnerability details or patient data.

## 9. Production hardening checklist

- [ ] `NODE_ENV=production`, `DEMO_MODE=false`, `ENABLE_TEST_ROUTES=false` (enforced), `COOKIE_SECURE=true`.
- [ ] Unique strong `AUTH_SECRET` from a secret manager; rotation procedure documented.
- [ ] TLS everywhere; HSTS at the proxy; HTTP → HTTPS redirect; API and SPA on the same site (SameSite cookies, CSRF).
- [ ] `CORS_ORIGINS` limited to the production web origin(s); `APP_BASE_URL` set to the public HTTPS URL.
- [ ] Reverse proxy sets `X-Forwarded-For` correctly (app trusts exactly 1 hop); restrict `/api/health/ready` (and optionally `/api/health/metrics`) to internal networks.
- [ ] Database: private network, TLS, least-privilege role (no superuser; app role cannot disable triggers), encrypted storage, automated backups + tested restore.
- [ ] Object storage: implement S3 adapter, private bucket, SSE, public access blocked; or encrypted private volume for `local`.
- [ ] Shared rate-limit store when running more than one instance; WAF in front.
- [ ] MFA for staff (at least admins and doctors) before go-live.
- [ ] Re-review finding F4 against the deployment topology.
- [ ] Log shipping to SIEM with alerting on `auth.refresh_reuse_detected`, `patient.break_glass`, `access.denied` spikes, 5xx spikes.
- [ ] Provider webhooks with signature verification; provider credentials in secret manager.
- [ ] Upload malware scanning.
- [ ] Dependency and container image scanning in CI; `npm audit` clean or triaged.
- [ ] Penetration test and remediation; incident-response and breach-notification runbook (see COMPLIANCE.md).
