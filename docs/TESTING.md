# Testing — [APP_NAME]

All test data is fictional and created by `server/prisma/seed.ts` or by the tests themselves. Never run any suite against a database containing real patient data.

## 1. Strategy

| Layer | Tool | Location | Purpose |
|---|---|---|---|
| Static | ESLint (flat config), TypeScript strict, Prettier | `eslint.config.js`, `tsconfig*.json` | Style, unsafe patterns, React hook rules, type safety |
| Unit | vitest | `server/test/unit/*.test.ts` | Pure domain rules and helpers: appointment state machine, vital validation and reference-range flags, money (paise) maths, time/IST helpers, crypto/HMAC links, upload validation, notification templates (minimum content), mock providers, CSV formula-injection escaping |
| API | Playwright `request` | `tests/api/*.spec.ts` | Every module over HTTP: auth/session, RBAC and patient-level ABAC, IDOR, break-glass, CSRF, idempotency, booking rules and **concurrency**, queue, clinical, immutable prescriptions, lab workflow, documents, notifications/consent, health data, billing, audit, DB safeguards |
| E2E UI | Playwright + Page Object Model | `tests/specs/*.spec.ts`, `tests/pages/*.ts` | User journeys per role in desktop, mobile and tablet viewports |
| Accessibility | `@axe-core/playwright` | `tests/specs/accessibility.spec.ts` (+ `checkA11y` fixture used in other specs) | WCAG 2.1 A/AA rules; the build fails on *serious* or *critical* violations |
| Responsive | Playwright projects | `tests/specs/responsive.spec.ts` | No horizontal scroll; navigation reachable on small screens |

### Test framework layout (`tests/`)

```
tests/
├── api/            API specs (no browser)
├── specs/          UI specs (run in 3 viewport projects)
├── pages/          Page objects — BasePage + one class per screen; no assertions on internals
├── fixtures/       index.ts (API: `as(role)`, `anon`, worker-scoped `refs`), ui.ts (`loginAs`, `checkA11y`)
├── data/           testData.ts — demo accounts and fictional values
├── utils/          api client, assertions, factories, slots, dates (IST), outbox, db, flows
└── scripts/        ensure-test-db.mjs — guard + create the isolated test database
```

Conventions: role-based locators (`getByRole`, `getByLabel`) over CSS; every test creates the records it mutates (factories, walk-in encounters, fresh patients) so specs are order-independent and parallel-safe; no fixed sleeps — use web-first assertions and `waitForOutbox`.

## 2. Environments and isolation

`playwright.config.ts` starts its own servers:

| Server | Port | Details |
|---|---|---|
| API | **4100** | `NODE_ENV=test`, `ENABLE_TEST_ROUTES=true`, database **`careflow_test`** — created if missing, migrated with `offline-migrate.mjs deploy` and **reseeded on every start** |
| Client | **5174** | Vite dev server with `VITE_API_PROXY_TARGET=http://localhost:4100`; only started when a UI project runs |

The dev API (4000), dev client (5173) and dev database `careflow` are never touched. `ensure-test-db.mjs` refuses to run unless the database name ends in `_test`.

Locally, `reuseExistingServer` is on: if something already listens on 4100/5174 it is reused (and **not** reseeded). Stop it to get a fresh seed.

| Variable | Default | Use |
|---|---|---|
| `TEST_DATABASE_URL` | `postgresql://careflow:careflow_dev@localhost:5432/careflow_test` | Isolated DB (must end in `_test`) |
| `API_BASE_URL` / `E2E_BASE_URL` | `http://localhost:4100` / `http://localhost:5174` | Point at already-running servers |
| `PW_WORKERS` | CPU count (max 4) locally, 2 in CI | Parallelism |
| `PW_CHROMIUM_PATH` | — | Use a specific Chromium; otherwise falls back to `/opt/pw-browsers/chromium` when the bundled one is missing |
| `E2E_PASSWORD` | `Demo@12345` | Demo account password used by the seed and tests |

## 3. Running

```bash
npm run lint
npm run typecheck                         # server, client, tests
npm run test:unit                         # vitest
npm run test:api                          # Playwright --project=api
npm run test:e2e                          # api + desktop-chromium + mobile-chromium + tablet
npx playwright test --project=desktop-chromium
npx playwright test tests/api/concurrency.spec.ts
npx playwright test -g "prescription" --project=api
npx playwright test --repeat-each=3 --project=api    # flakiness check
npm run test:e2e:ui                       # Playwright UI mode
npm run test:report                       # open the last HTML report
```

First run: `npx playwright install chromium` (skip where a Chromium is pre-provisioned). PostgreSQL must be running and the role must be able to create `careflow_test` (or create it once: `CREATE DATABASE careflow_test OWNER careflow;`).

Artifacts: `playwright-report/` (HTML), `test-results/` (trace, screenshot and video retained on failure). Both are git-ignored. Open a trace with `npx playwright show-trace test-results/<test>/trace.zip`.

## 4. What the suites prove

### Mandatory concurrency test — `tests/api/concurrency.spec.ts`

1. N simultaneous booking requests for one slot → exactly one `201`, all others `409 SLOT_UNAVAILABLE`; the database holds one active appointment for that slot.
2. A patient and a receptionist racing for the same slot → one winner.
3. The same `Idempotency-Key` submitted concurrently or twice → one appointment; the replay returns the original response.

The guarantee comes from the partial unique index `Appointment_active_slot_key` (see ARCHITECTURE.md), not from application checks alone, so it also holds across API replicas.

### Security and privacy (API)

- 401 without a session; 403 on missing/incorrect CSRF token for cookie sessions.
- Role matrix: each role is denied endpoints outside its grants (e.g. accountant → clinical notes, pharmacist → lab entry, patient → staff routes).
- Patient A cannot read patient B's appointments, prescriptions, reports or documents (IDOR); proxies see only linked dependents.
- Cross-facility staff are denied; break-glass requires `X-Access-Reason` (≥ 10 chars) and writes an audit entry.
- Login rate limiting (429) and account lockout (423).
- Upload rejection: renamed executable, MIME/extension mismatch, oversize; download URLs are short-lived and bound to the requesting user.
- Secure notification links: expired or other-patient links are refused; message bodies carry no diagnosis or results.
- Finalized prescriptions cannot be edited via the API **or directly in SQL** (DB trigger); amendments create a new version. `AuditLog` and consent records are append-only (DB triggers).
- `/api/health/metrics` requires `report:operational`; test routes are absent unless enabled and refused in production.

### UI journeys (each in 3 viewports)

Authentication and session expiry · patient registration and duplicate warning · doctor search and filters · booking, reschedule, cancel · reception check-in and queue · consultation (SOAP autosave, diagnosis, finalize) · vitals with reference-range flag and "review with clinician" message · prescription builder, finalize, amend, PDF · investigation order → result entry → verify → release → patient view · notification preferences and consent · access control (direct URL to another role's page) · audit trail view · responsive and axe checks.

## 5. Latest local results (2026-09-26, this repository)

| Suite | Result |
|---|---|
| ESLint | 0 errors, 0 warnings |
| Typecheck (server, client, tests) | pass |
| Unit (vitest) | 229 passed |
| API | 86 passed, 0 skipped |
| UI desktop-chromium + mobile-chromium | 86 passed |
| UI tablet | 43 passed |
| Demo page (`demo/clinic-demo.html`) | all 13 steps walked via file:// on desktop and mobile: no console errors, no network requests, no horizontal scroll, axe (reduced motion) 0 serious/critical |

Environment: Linux (2 vCPU), Node 22, PostgreSQL 16, Chromium only. **Not run:** WebKit/Safari and Firefox engines (the tablet project uses an iPad viewport with Chromium), real SMS/WhatsApp/payment providers, load testing, penetration testing, screen-reader testing with real assistive technology.

## 6. CI

`.github/workflows/ci.yml` runs on push/PR: install → Prisma generate → lint → typecheck → unit → build → migrate + seed smoke check → API tests → install Chromium → UI tests (3 projects). A throwaway `AUTH_SECRET` is generated and masked per job. Playwright reports and traces are uploaded as artifacts for 14 days. CI uses retries = 2 and `forbidOnly`.

## 7. Adding tests

1. API: add `tests/api/<module>.spec.ts`; use `as('<role>')` from `fixtures/index.ts` and `expectOk` / `expectError` from `utils/assertions.ts`. Create what you mutate via `utils/factories.ts` or `utils/flows.ts`.
2. UI: add or extend a page object in `tests/pages/` (extend `BasePage`), then a spec in `tests/specs/`. Keep selectors in page objects, assertions in specs. Call `checkA11y(page)` on new screens.
3. Keep data fictional: `@example.test` emails, `Demo-` surnames, mobiles from the seed's fictional range (numbers ending in `0000` or `9999` make the mock notification provider fail on purpose).
