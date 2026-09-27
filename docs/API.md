# API Reference — [APP_NAME]

Derived from `server/src/routes/*.routes.ts` and `server/src/app.ts`. Base URL in development: `http://localhost:4000/api` (the Vite dev server proxies `/api` from `http://localhost:5173`). All request/response bodies are JSON unless stated.

## Conventions

### Response envelope

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 } }
```

`meta` is present only on paginated lists. Exceptions: `GET /api/interop/fhir/Patient/:id/everything` (raw FHIR Bundle), `GET /api/documents/download/:token` (file bytes), reports with `format=csv` (CSV).

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some of the information provided is invalid.",
    "details": [{ "path": "startAt", "message": "Invalid datetime" }],
    "requestId": "0b6c2f0e-6f1e-4c0c-9a51-2f3c1d9b8e11"
  }
}
```

`details` appears for validation errors (and for `PATIENT_POSSIBLE_DUPLICATE` to staff, with masked candidates). `requestId` matches the `X-Request-Id` response header (absent on the 404 fallback and rate-limit responses). Messages are user-safe; internal details are never returned.

| Code | HTTP | Typical cause |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod validation, business input rules |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `AUTH_REQUIRED` | 401 | No/invalid token |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password (also for disabled accounts) |
| `SESSION_EXPIRED` | 401 | Expired access token, revoked/expired session or refresh token |
| `PAYMENT_FAILED` | 402 | Gateway declined (mock: amount ending `.13`) |
| `FORBIDDEN` | 403 | Missing permission or failed resource policy |
| `CSRF_TOKEN_INVALID` | 403 | Cookie auth without matching `X-CSRF-Token` |
| `HEALTH_PERMISSION_DENIED` | 403 | Health-data source not GRANTED |
| `NOT_FOUND` | 404 | Unknown resource, or resource outside your organisation/visibility |
| `CONFLICT` | 409 | Unique conflict, concurrent change, duplicate booking |
| `SLOT_UNAVAILABLE` | 409 | Seat taken concurrently / hold expired |
| `PATIENT_POSSIBLE_DUPLICATE` | 409 | Registration matches an existing patient |
| `EMAIL_ALREADY_REGISTERED` | 409 | Registration/staff creation with an existing email |
| `INVALID_STATE_TRANSITION` | 409 | Status change not allowed |
| `PRESCRIPTION_FINALIZED` | 409 | Editing a finalized prescription / concurrent finalize |
| `STALE_VERSION` | 409 | Encounter draft saved with an old `version` |
| `REQUEST_IN_PROGRESS` | 409 | Same `Idempotency-Key` still processing |
| `LINK_EXPIRED` | 410 | Secure link or download URL expired/used up |
| `FILE_TOO_LARGE` | 413 | Upload > `UPLOAD_MAX_BYTES` |
| `FILE_REJECTED` | 415 | Not a genuine PDF/PNG/JPEG, empty, or MIME/extension mismatch |
| `UNPROCESSABLE` | 422 | Business rule (e.g. check-in on the wrong day) |
| `DOCTOR_UNAVAILABLE` | 422 | No schedule at that time / doctor not at facility |
| `CANCELLATION_WINDOW_CLOSED` / `RESCHEDULE_WINDOW_CLOSED` | 422 | Patient action inside the org's window |
| `CONSENT_REQUIRED` | 422 | Teleconsult consent missing / adult dependent without attestation |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different body |
| `ACCOUNT_LOCKED` | 423 | Too many failed logins |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected error (logged with requestId) |
| `HEALTH_DEVICE_UNAVAILABLE` / `PROVIDER_UNAVAILABLE` | 503 | Device/provider unavailable, S3 stub |

(`APPOINTMENT_SLOT_UNAVAILABLE` is declared in `lib/errors.ts` but never raised.)

### Authentication

| Mode | How | CSRF |
|---|---|---|
| Browser (default) | `POST /api/auth/login` sets cookies `cf_at` (httpOnly, path `/`, 15 min), `cf_rt` (httpOnly, path `/api/auth`, 7 days), `cf_csrf` (readable, path `/`, 7 days); all `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true` (default in production) | Required on POST/PUT/PATCH/DELETE of authenticated routes: header `X-CSRF-Token: <cf_csrf value>` (also returned as `data.csrfToken`) |
| API client | Send `X-Auth-Mode: bearer` to login/register/refresh → body also contains `accessToken`, `refreshToken`; then `Authorization: Bearer <accessToken>` | Not required |

Access tokens are HS256 JWTs (`iss: careflow`, `aud: careflow-api`, claims `sub`, `sid`); the session is re-checked on every request.

### Permissions notation

`Auth: —` public · `Auth: user` any signed-in user (service-level policy still applies) · `perm:a | perm:b` route requires at least one. "Portal" = patient or active proxy (clinical data requires `accessLevel FULL`).

### Pagination

Query `page` (≥ 1, default 1), `pageSize` (1–100, default 20). Response `meta: { page, pageSize, total, totalPages }`. Paginated: directory doctors, patient search, appointments, investigations worklist, invoices, notifications log, audit.

### Idempotency

Header `Idempotency-Key: <8–128 chars [A-Za-z0-9_-]>` on routes marked **Idem**. Same key + same body within 24 h → stored response replayed with `Idempotent-Replay: true`; same key + different body → `422 IDEMPOTENCY_KEY_REUSED`; concurrent duplicate → `409 REQUEST_IN_PROGRESS`; 5xx responses are not stored. Keys are scoped per user and route.

### Rate limits

All `/api`: `API_RATE_LIMIT_MAX` (1200) per minute per IP. `POST /auth/login` and `POST /auth/register`: `LOGIN_RATE_LIMIT_MAX` (10) per `LOGIN_RATE_LIMIT_WINDOW_MS` (60 s) per IP + submitted email. `RateLimit` headers (draft-7) are returned.

### Dates and times

Instants are ISO-8601 with offset (`2026-09-26T09:30:00.000Z`); calendar dates are `YYYY-MM-DD`. Appointment list date filters and dashboards interpret dates in `Asia/Kolkata`; availability uses the facility timezone.

---

## Health & configuration

| Method | Path | Auth | Response `data` |
|---|---|---|---|
| GET | `/api/health` | — | `{ status: "ok", time }` |
| GET | `/api/health/ready` | — | `{ status: "ready", database: "ok", providers: {sms, whatsapp, email, storage, payment, teleconsult, signing, healthData, fhir, abdm}, demoMode, appName }` (500 if DB unreachable) |
| GET | `/api/health/metrics` | `report:operational` | `{ counters, latency: { "GET /api/appointments": {count, avgMs, maxMs} } }` |
| GET | `/api/config` | — | `{ appName, demoMode, currency: "INR", timezone: "Asia/Kolkata", emergencyNumber: "112" }` |

## Auth — `/api/auth`

| Method | Path | Auth | Body | Notes / errors |
|---|---|---|---|---|
| POST | `/login` | — (login limiter) | `{ email, password }` | 200 `{ user, csrfToken, accessToken?, refreshToken? }`. `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` (5 failures → 15 min), `RATE_LIMITED` |
| POST | `/register` | — (login limiter) | Patient registration (below) | 201 same shape as login; creates User (role PATIENT) + Patient + consents. `EMAIL_ALREADY_REGISTERED`, `PATIENT_POSSIBLE_DUPLICATE` (no candidate details for self-registration), `VALIDATION_ERROR` (password policy) |
| POST | `/refresh` | refresh cookie `cf_rt` or body `{ refreshToken }` | — | Rotates refresh token; reuse of a revoked token revokes all the user's sessions. `SESSION_EXPIRED` |
| POST | `/logout` | user | — | Revokes the session, clears cookies |
| GET | `/me` | user | — | `{ user, csrfToken }` |
| POST | `/change-password` | user | `{ currentPassword, newPassword }` | Revokes all sessions and clears cookies. `INVALID_CREDENTIALS` |

`user` object: `{ id, email, displayName, organizationId, roles[], permissions[], facilityScope ("ALL" or facility ids), doctorId, patientId }`.

Password policy (`services/auth/passwords.ts`): 10–128 chars, at least one lowercase, one uppercase, one digit.

Registration body (`validators/patient.schemas.ts#registerSchema`):

```json
{
  "email": "new.patient@example.test",
  "password": "Str0ngPassw0rd",
  "firstName": "Meera", "lastName": "Example",
  "dateOfBirth": "1992-03-14", "gender": "FEMALE",
  "mobile": "9876501234",
  "acceptTerms": true,
  "organizationCode": "DEMO",
  "address": { "line1": "1 Demo Road", "city": "Pune", "state": "Maharashtra", "postalCode": "411001" },
  "emergencyContact": { "name": "R. Example", "relationship": "Spouse", "phone": "+919876500000" },
  "medicalProfile": { "bloodGroup": "O+", "allergies": [{ "substance": "Penicillin", "severity": "MODERATE" }], "conditions": [] },
  "consents": { "sms": true, "whatsapp": true, "email": false }
}
```

`mobile` accepts 10-digit Indian numbers (normalised to `+91…`) or E.164. `organizationCode` omitted → the oldest organisation. `gender`: `FEMALE | MALE | OTHER | UNDISCLOSED`. Consents default to all `false`.

## Directory (public) — `/api/directory`

Also mounted at `/api/doctors` (same router, so e.g. `/api/doctors/doctors/:id`).

| Method | Path | Query | Response `data` |
|---|---|---|---|
| GET | `/facilities` | — | `[{ id, name, code, type, phone, address, departments: [{id, name, code}] }]` |
| GET | `/departments` | `facilityId?` | `[{ id, name, code, description, facility: {id, name}, doctorCount }]` |
| GET | `/specialties` | — | `["Cardiologist", …]` |
| GET | `/doctors` | `q?, specialty?, departmentId?, facilityId?, language?, consultationType?, withNextSlot=true?, page, pageSize` | Paginated public doctor profiles (`displayName, qualifications, specialty, experienceYears, registrationNumber, registrationCouncil, bio, languages, gender, consultationFee, teleconsultationFee, consultationTypes, departments[]`), plus `nextAvailableSlot` (next 7 days) when requested |
| GET | `/doctors/:id` | — | Profile + `nextAvailableSlot` (next 14 days) |
| GET | `/doctors/:id/availability` | `date` (required), `facilityId?`, `type?` | `{ date, slots: [Slot] }` |

`consultationType` / `type`: `IN_PERSON | TELECONSULTATION | FOLLOW_UP | URGENT | DIAGNOSTIC | PROCEDURE`.

```json
{ "startAt": "2026-09-26T09:30:00.000Z", "endAt": "2026-09-26T09:45:00.000Z", "localTime": "15:00",
  "status": "AVAILABLE", "capacity": 1, "booked": 0,
  "scheduleId": "…", "facilityId": "…", "departmentId": "…", "roomId": "…" }
```

Slot `status`: `AVAILABLE | FULL | PAST | BLOCKED`.

## Patients — `/api/patients` (Auth: user)

| Method | Path | Permission / policy | Body / query | Notes |
|---|---|---|---|---|
| GET | `/` | `patient:search` | `q, uhid, mobile, dateOfBirth, email, appointmentNumber, page, pageSize` | Own organisation only; demographic projection; audited `patient.search` |
| POST | `/` | `patient:create` | Registration fields without password/terms + `confirmNotDuplicate?` | 201. `PATIENT_POSSIBLE_DUPLICATE` with `details.candidates` (masked mobile) unless `confirmNotDuplicate: true` (audited) |
| GET | `/me/dependents` | user | — | `[{ proxyId, relationship, status, accessLevel, patient }]` |
| POST | `/me/dependents` | `portal:self` | Patient core fields + `relationship` (`PARENT, CHILD, SPOUSE, LEGAL_GUARDIAN, CAREGIVER, OTHER`), `adultConsentAttestation?` | 201. Minor → proxy ACTIVE; adult → PENDING (needs staff activation); adult without attestation → `CONSENT_REQUIRED` |
| POST | `/me/dependents/:proxyId/revoke` | `portal:self` (caregiver or the patient) | — | Sets proxy REVOKED |
| GET | `/:id` | Portal, or staff `patient:read` | — | Demographics + `age`, `isMinor`, address, contacts |
| PATCH | `/:id` | Portal (FULL) or `patient:update` | Partial patient core + `bloodGroup` | Audited with before/after of changed fields |
| GET | `/:id/medical-profile` | Portal (FULL) or clinical access | Header `X-Access-Reason` (break-glass, ≥ 10 chars) | `{ bloodGroup, allergies, history }` |
| POST | `/:id/allergies` | Portal or `clinical:write` + clinical access | `{ substance, reaction?, severity? }` | 201 |
| POST | `/:id/history` | Portal or `clinical:write` + clinical access | `{ type: CONDITION|SURGERY|FAMILY_HISTORY|CURRENT_MEDICATION|NOTE, description, onsetDate? }` | 201 |
| DELETE | `/:id/allergies/:recordId` | `clinical:write` + clinical access | — | Soft: status INACTIVE |
| GET | `/:id/timeline` | Portal or clinical access | `types=CONSULTATION,PRESCRIPTION,LAB,IMAGING,DOCUMENT,VITALS`, `limit` (≤ 200, default 100) | `[{ id, type, date, title, summary[], refId, status? }]`; portal sees finalized/released items only |
| GET | `/:id/proxies` | Portal or `patient:read` | — | Guardian/proxy links |
| POST | `/:id/proxies/:proxyId/activate` | `patient:update` | — | Staff verification of an adult proxy |
| GET | `/:id/consents` | Portal or `patient:read` | — | `{ current: [{channel, optedIn, updatedAt, source}], history }` |
| PUT | `/:id/consents` | Portal or `patient:update` | `{ channel: SMS|WHATSAPP|EMAIL, optedIn }` | Appends a consent row (source PORTAL/RECEPTION); audited |

## Appointments — `/api/appointments` (Auth: user)

Booking body (`bookSchema`): `{ doctorId, patientId, startAt (ISO with offset), type, reason?, facilityId?, followUpOfId? }`.

| Method | Path | Permission / policy | Body / query | Response / errors |
|---|---|---|---|---|
| GET | `/` | Portal: own/proxy; staff with `appointment:read`: org + facility scope (doctors see own unless also check-in role) | `date` or `from`/`to` (YYYY-MM-DD, IST), `doctorId, facilityId, departmentId, patientId, status=CSV, mine=true, page, pageSize` | Paginated appointments incl. doctor, department, facility, patient, queueToken, intake, encounter |
| POST | `/holds` **Idem** | Portal with `appointment:book_self`, or `appointment:manage` in scope | Booking body | 201 `HELD` with `holdExpiresAt` (org `holdMinutes`) |
| POST | `/` **Idem** | same | Booking body | 201 `CONFIRMED`; sends `APPOINTMENT_CONFIRMED` |
| POST | `/walk-ins` **Idem** | `appointment:manage` | `{ patientId, doctorId, facilityId, reason?, urgent? }` | 201 `WAITING` with queue token (urgent → priority 10) |
| POST | `/waitlist` | Portal or `appointment:manage` | `{ doctorId, patientId, preferredDate, note? }` | 201 waitlist entry (set to OFFERED when a cancellation frees that doctor/date) |
| POST | `/reminders/run` | `notification:manage` | `{ leadHours? (1–72, default 24) }` | `{ considered }`; reminders deduplicated per appointment |
| GET | `/:id` | Portal or staff same org | — | Appointment + status `history` |
| POST | `/:id/confirm` **Idem** | Portal or staff | `{ reason? }` | `CONFIRMED`. Expired hold → `SLOT_UNAVAILABLE` |
| POST | `/:id/cancel` | Portal (outside `cancellationWindowHours`) or staff | `{ reason? }` | `CANCELLED`; releases queue token; `CANCELLATION_WINDOW_CLOSED` |
| POST | `/:id/reschedule` **Idem** | Portal (outside `rescheduleWindowHours`) or staff | `{ startAt, reason? }` | New `CONFIRMED` appointment (`rescheduledFromId`), old → `RESCHEDULED`, intake moved |
| POST | `/:id/check-in` | `appointment:checkin` | — | `WAITING` + queue token. Only on the appointment's local day (`UNPROCESSABLE`) |
| POST | `/:id/no-show` | `appointment:checkin` | — | `NO_SHOW` (only after start time) |
| PUT | `/:id/intake` | Portal or `appointment:checkin`/`appointment:manage` | `{ chiefComplaint, symptoms[], symptomDuration?, existingConditions?, allergiesText?, currentMedications?, answers{} }` | Upsert; closed for terminal statuses |
| GET | `/:id/intake` | Same as `GET /:id` | — | Intake or `null` |

Booking errors: `DOCTOR_UNAVAILABLE` (422, no matching slot), `SLOT_UNAVAILABLE` (409), `CONFLICT` (409, patient already booked that slot), `FORBIDDEN` (cannot book for this patient), `UNPROCESSABLE` (inactive patient).

## Queue — `/api/queue`

| Method | Path | Auth | Body / query | Notes |
|---|---|---|---|---|
| GET | `/display/:queueId` | — | — | `{ doctor, room, nowServing, upNext[5], waitingCount }` — token numbers only |
| GET | `/` | `queue:read` | `doctorId, facilityId` (required), `date?` | `{ queue, date, nowServing, next, waitingCount, avgWaitMinutes, tokens[] }` |
| POST | `/:queueId/call-next` | `queue:manage` | — | Next WAITING → CALLED; sends `QUEUE_CALLED`. No one waiting → 404 |
| POST | `/tokens/:tokenId/recall` | `queue:manage` | — | CALLED/SKIPPED → CALLED (recallCount + 1) |
| POST | `/tokens/:tokenId/skip` | `queue:manage` | — | WAITING/CALLED → SKIPPED |
| POST | `/tokens/:tokenId/requeue` | `queue:manage` | — | SKIPPED → WAITING |
| POST | `/tokens/:tokenId/absent` | `queue:manage` | — | → ABSENT; appointment → NO_SHOW |
| POST | `/tokens/:tokenId/transfer` | `queue:manage` | `{ doctorId }` | New token in the target doctor's queue (same facility) |

Staff must be in the queue's organisation/facility scope; doctors manage only their own queue.

## Consultation — `/api/encounters` (Auth: user)

| Method | Path | Permission | Body | Notes |
|---|---|---|---|---|
| POST | `/` **Idem** | `encounter:write` (the appointment's doctor) | `{ appointmentId }` | 201. Appointment must be CHECKED_IN/WAITING (teleconsult: also CONFIRMED) → IN_CONSULTATION; returns existing encounter if already started |
| GET | `/:id` | Clinical access | — | Encounter + patient, doctor, appointment (+intake), notes, active vitals, diagnoses, prescriptions, orders |
| PATCH | `/:id` | `encounter:write` (treating doctor) | `{ version, chiefComplaint?, historyOfIllness?, examinationFindings?, assessmentNotes?, planNotes?, followUpDate?, followUpInstructions? }` | `version` increments; `STALE_VERSION` |
| POST | `/:id/notes` | `encounter:write` | `{ type?: SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN|GENERAL|ADDENDUM, content, isAiDraft? }` | 201 DRAFT; after completion → FINAL ADDENDUM |
| PATCH | `/notes/:noteId` | `encounter:write` | `{ content }` | DRAFT notes only |
| POST | `/notes/:noteId/approve-ai-draft` | `encounter:write` | `{ content? }` | Records reviewer |
| POST | `/:id/diagnoses` | `encounter:write` | `{ description, code?, codeSystem?: ICD10|ICD11|SNOMED_CT|FREE_TEXT, type?: PRIMARY|SECONDARY|DIFFERENTIAL|PROVISIONAL }` | 201; in-progress encounters only |
| DELETE | `/diagnoses/:diagnosisId` | `encounter:write` | — | Marks ENTERED_IN_ERROR |
| POST | `/:id/vitals` | `vital:write` | `{ measurements: [Measurement], context? }` | 201 vitals with `flag` and `guidance` |
| POST | `/:id/orders` | `investigation:order` | `{ investigationId, priority?: ROUTINE|URGENT|STAT, clinicalNotes? }` | 201 order ORDERED |
| POST | `/:id/prescriptions` | `prescription:write` | — | 201 draft (existing draft returned) |
| POST | `/:id/complete` **Idem** | `encounter:write` | `{ followUpDate?, followUpInstructions? }` | Finalizes notes, appointment → COMPLETED, token → COMPLETED, `FOLLOW_UP_REMINDER` if follow-up. Blocked by a non-empty draft prescription or unreviewed AI drafts (`UNPROCESSABLE`) |

Measurement: `{ type: HEART_RATE|BLOOD_PRESSURE|RESPIRATORY_RATE|TEMPERATURE|OXYGEN_SATURATION|HEIGHT|WEIGHT|BMI, value, value2? (diastolic), unit, measuredAt? }`. Units: `bpm`, `mmHg`, `breaths/min`, `°C`/`°F` (stored °C), `%`, `cm`, `kg`, `kg/m²`. Implausible values → `VALIDATION_ERROR` with `details[{index, code: MISSING_UNIT|INVALID_UNIT|OUT_OF_RANGE|MISSING_VALUE|FUTURE_TIMESTAMP}]`. Height + weight → BMI added automatically.

```json
{ "success": true, "data": [
  { "id": "…", "type": "HEART_RATE", "value": "118", "unit": "bpm", "flag": "REQUIRES_REVIEW",
    "guidance": { "message": "This measurement is outside the configured reference range. Please review the result with a qualified healthcare professional." } } ] }
```

## Vitals — `/api/vitals` (Auth: user)

| Method | Path | Permission / policy | Body / query |
|---|---|---|---|
| GET | `/patients/:patientId` | Portal (FULL) or `vital:read` + clinical access | `type?, includeHistory=true?, limit (≤ 500, default 100)` |
| GET | `/patients/:patientId/trend` | Portal or clinical access | `type` (required) → `[{ measuredAt, value, value2, unit, flag, source }]` |
| POST | `/patients/:patientId` | Portal (source `PATIENT_REPORTED`) or `vital:write` + clinical access | `{ measurements[], context? }` |
| POST | `/:vitalId/correct` | `vital:write` | `{ value, value2?, unit, reason (3–300) }` → new row, original CORRECTED |

## Prescriptions — `/api/prescriptions` (Auth: user)

| Method | Path | Permission / policy | Body | Notes |
|---|---|---|---|---|
| GET | `/medications` | user | `?q=` (1–60 chars) | Generic-name catalogue search (≤ 20) |
| GET | `/patients/:patientId` | Portal (finalized only) or clinical access | — | Summary list incl. latest version items and `documentId` |
| GET | `/:id` | Prescribing doctor (drafts); portal; clinical access; `prescription:dispense_read` (same org, audited) | — | Finalized: `current` version (snapshot, contentHash, documentId, signatureMethod, signatureRef) + all versions. Draft: items + allergy `warnings` |
| PATCH | `/:id` | `prescription:write` (prescribing doctor) | `{ advice?, followUpDate?, investigationNotes?, items? (replaces all, ≤ 30) }` | Draft only (`PRESCRIPTION_FINALIZED`) |
| POST | `/:id/items` | `prescription:write` | Item | 201 draft view |
| PATCH | `/:id/items/:itemId` | `prescription:write` | Partial item | |
| DELETE | `/:id/items/:itemId` | `prescription:write` | — | Re-numbers sort order |
| POST | `/:id/reorder` | `prescription:write` | `{ itemIds[] }` (all items exactly once) | |
| POST | `/:id/finalize` **Idem** | `prescription:finalize` | `{ confirm: true }` | Version 1, PDF, secure-link notification. Missing confirm → `VALIDATION_ERROR`; no items → `VALIDATION_ERROR` |
| POST | `/:id/amend` **Idem** | `prescription:finalize` | `{ reason (≥ 5), items[] (≥ 1), advice?, followUpDate?, investigationNotes? }` | New version, status AMENDED, new PDF |
| DELETE | `/:id` | `prescription:write` | — | Discards a draft (status CANCELLED) |

Item: `{ medicationId?, medicineName, strength?, dose, route, frequency, timing?, durationDays (1–365), quantity?, instructions?, refills? (0–12) }`.

## Investigations — `/api/investigations` (Auth: user)

| Method | Path | Permission / policy | Body / query | Notes |
|---|---|---|---|---|
| GET | `/catalog` | user | `q?` | Tests with `parameters[{code, name, unit, refLow, refHigh, refText}]` |
| GET | `/worklist` | `investigation:process` | `status=CSV?, facilityId?, page, pageSize` | Facility-scoped; patient identity + age only |
| GET | `/patients/:patientId` | Portal (released only) or clinical access | — | |
| GET | `/patients/:patientId/trend` | Portal or clinical access | `parameterCode` | Verified numeric results over time |
| GET | `/orders/:id` | Portal (after release), lab in scope, or `investigation:read` + clinical access | — | Order + active results + report |
| POST | `/orders/:id/status` | Lab in scope; ordering doctor may set CANCELLED | `{ status: SCHEDULED|COLLECTED|PROCESSING|CANCELLED, reason? }` | COMPLETED/VERIFIED only via results/verify |
| POST | `/orders/:id/results` | `investigation:process` | `{ results: [{ parameterCode, valueNumeric?|valueText?, unit?, refLow?, refHigh?, refText?, abnormal? }], correctionReason? }` | Order → COMPLETED; flags LOW/HIGH/NORMAL/ABNORMAL/NOT_APPLICABLE; reason required after VERIFIED |
| POST | `/orders/:id/report` | `investigation:process` | multipart `file` (+ `summary`) | 201; stored as LAB_REPORT/IMAGING_REPORT |
| POST | `/orders/:id/verify` | `investigation:verify` | — | VERIFIED; auto-release + `LAB_REPORT_READY` if `autoReleaseLabReports` |
| POST | `/orders/:id/comment` | `clinical:write` + clinical access | `{ comment }` | Doctor comment |

## Documents — `/api/documents` (Auth: user)

| Method | Path | Permission / policy | Body / query | Notes |
|---|---|---|---|---|
| GET | `/patients/:patientId` | Portal (PATIENT_VISIBLE, released lab docs) or clinical access | `type?` | Metadata only |
| POST | `/` | Portal (stored as PATIENT_UPLOAD) or `document:upload` + access | multipart: `file`, `patientId`, `type?` (`PRESCRIPTION, LAB_REPORT, IMAGING_REPORT, REFERRAL_LETTER, DISCHARGE_SUMMARY, PATIENT_UPLOAD, OTHER`), `title?`, `encounterId?`, `visibility?` (`PATIENT_VISIBLE|CLINICAL_ONLY`) | 201. `FILE_REJECTED`, `FILE_TOO_LARGE` |
| GET | `/:id/url` | Authorised for the document | — | `{ url: "/api/documents/download/<token>", expiresAt }` (TTL `DOWNLOAD_URL_TTL_SECONDS`) |
| GET | `/download/:token` | Same user the URL was issued to | `inline=1` (PDF only) | File bytes, `Cache-Control: no-store`, sandbox CSP. Expired → `LINK_EXPIRED`; other user → `FORBIDDEN` |

## Billing — `/api/billing` (Auth: user)

| Method | Path | Permission / policy | Body / query | Notes |
|---|---|---|---|---|
| GET | `/services` | user | `facilityId` | Active price list |
| PUT | `/services` | `service:manage` (facility scope) | `{ facilityId, code, name, category: CONSULTATION|DIAGNOSTIC|PROCEDURE|OTHER, price, taxRatePct?, isActive? }` | Upsert by (facility, code) |
| GET | `/invoices` | Portal (own) or `billing:read` (org/facility scope) | `patientId?, status?, page, pageSize` | |
| POST | `/invoices` **Idem** | `billing:manage` | `{ patientId, facilityId, appointmentId?, discount?, items: [{ serviceId?, description?, quantity?, unitPrice?, discount? }] }` | 201 ISSUED; totals computed server-side |
| POST | `/appointments/:appointmentId/invoice` | `billing:manage` | — | 201 consultation invoice from the doctor's fee (tele fee for teleconsults); returns existing non-void invoice |
| GET | `/invoices/:id` | Portal or `billing:read` | — | Invoice + items + payments |
| POST | `/invoices/:id/payments` **Idem** | Portal (not CASH) or `billing:manage` | `{ method: CASH|CARD|UPI|ONLINE, amount? }` (default: full due) | 201 invoice. Mock: amount ending `.13` → `402 PAYMENT_FAILED` |
| POST | `/payments/:id/refund` | `payment:refund` | `{ amount?, reason }` | Invoice with updated `amountPaid` |

Money values are decimal strings with up to 2 decimals (`"500.00"`, input also accepts numbers); responses may serialise without trailing zeros (`"600"`).

## Notifications — `/api/notifications` (Auth: user)

| Method | Path | Permission | Body / query | Notes |
|---|---|---|---|---|
| GET | `/` | `notification:read` | `patientId?, status?, channel?, page, pageSize` | Org-scoped delivery log with attempts (`logs[]`); no bodies or variables |
| GET | `/mine` | user (portal) | — | Last 50: `{ id, channel, templateKey, status, createdAt }` |
| POST | `/:id/retry` | `notification:manage` | — | `{ status }` — FAILED only |
| POST | `/process-due` | `notification:manage` | — | `{ processed }` — dispatch due retries now |
| POST | `/secure-links/resolve` | user (portal) | `{ token }` | `{ purpose: PRESCRIPTION_VIEW|LAB_REPORT_VIEW|DOCUMENT_VIEW, resourceType, resourceId, patientId }`. `NOT_FOUND`, `LINK_EXPIRED`, `FORBIDDEN` (other patient) |

Notification `status`: `QUEUED, SENT, DELIVERED, READ, FAILED, SKIPPED_NO_CONSENT, SKIPPED_NO_CONTACT` (see schema enum `NotificationStatus`).

### Secure links

SMS/WhatsApp/email for prescriptions and lab reports contain only `APP_BASE_URL/s/<token>`. The client route `/s/:token` must sign the user in, then call `POST /api/notifications/secure-links/resolve` and navigate to the resource. Tokens: random, hashed at rest, expire after `SECURE_LINK_TTL_HOURS` (72), max 5 uses.

## Health data — `/api/health-data` (Auth: user)

| Method | Path | Policy | Body | Notes |
|---|---|---|---|---|
| GET | `/patients/:patientId/sources` | Portal or `healthdata:read` + clinical access | — | Sources with `permissionStatus` |
| POST | `/patients/:patientId/sources` | Portal only | `{ providerType, scenario?, deviceName?, clientReportedStatus?: GRANTED|DENIED }` | 201 source (GRANTED/DENIED) |
| DELETE | `/patients/:patientId/sources/:providerType` | Portal only | — | REVOKED |
| POST | `/patients/:patientId/sync` | Portal only | `{ providerType? (default MOCK), scenario? }` | Pull readings (MOCK only). `HEALTH_PERMISSION_DENIED`, `HEALTH_DEVICE_UNAVAILABLE`, `PROVIDER_UNAVAILABLE` |
| POST | `/patients/:patientId/readings` | Portal only | `{ providerType, readings: [{ bpm, measuredAt, externalId, context?, deviceName? }] (≤ 500) }` | 201 stored readings with `validation`, `flag`, `guidance` |
| GET | `/patients/:patientId/readings` | Portal or `healthdata:read` + clinical access | — | Last 50 |
| POST | `/readings/:readingId/promote` | `vital:write` | `{ encounterId? }` | 201 Vital; VALID readings only |

`providerType`: `MOCK, APPLE_HEALTHKIT, ANDROID_HEALTH_CONNECT, WEARABLE, BLUETOOTH_DEVICE, CAMERA_PPG_DEMO`. Mock `scenario`: `permission_denied, device_unavailable, provider_failure, invalid_reading, future_timestamp, elevated`.

## Teleconsultation — `/api/teleconsultation` (Auth: user)

| Method | Path | Permission / policy | Body | Notes |
|---|---|---|---|---|
| POST | `/appointments/:id/join` | Appointment doctor (`teleconsult:host`) or patient/proxy | `{ consent? }` | `{ provider, token, expiresAt, roomUrl, mock }`. First patient join without `consent: true` → `CONSENT_REQUIRED`; outside window → `UNPROCESSABLE` |
| POST | `/appointments/:id/convert-in-person` | `teleconsult:host` (appointment doctor) | `{ note (5–500) }` | Status CONVERTED_TO_IN_PERSON |
| POST | `/appointments/:id/end` | `teleconsult:host` | — | ENDED |

## Dashboards — `/api/dashboards` (Auth: user)

| Method | Path | Permission | Query | Data |
|---|---|---|---|---|
| GET | `/patient` | `portal:self` | — | `{ nextAppointment, upcoming, recentPrescriptions, recentReports, recentVisits }` |
| GET | `/doctor` | `encounter:write` | `date?` | Today's list/queue and counts for the doctor |
| GET | `/reception` | `appointment:checkin` \| `appointment:manage` | `date?` | Day's appointments/check-ins in scope |
| GET | `/admin` | `report:operational` | `from?, to?` | Organisation KPIs |

## Reports — `/api/reports` (Auth: user)

Query for all: `from, to` (required, YYYY-MM-DD, IST), `doctorId?, departmentId?, facilityId?, status?, format=json|csv` (CSV implemented for `appointments` and `doctors`; CSV exports are audited as `data.export`).

| Method | Path | Permission | Data |
|---|---|---|---|
| GET | `/appointments` | `report:operational` | Counts + `rows[]` (no clinical content) |
| GET | `/patients` | `report:operational` | `{ newRegistrations, newPatientsSeen, returningPatientsSeen, registrationTrend[] }` |
| GET | `/doctors` | `report:operational` | `[{ doctorId, doctor, specialty, appointments, completed, cancelled, noShows }]` |
| GET | `/revenue` | `report:financial` | `{ consultationRevenue, serviceRevenue, refunds, collectedByMethod }` |
| GET | `/clinical` | `report:clinical` | `{ completedEncounters, topDiagnoses[] }` (doctor's own encounters, aggregates only) |

## Audit — `/api/audit`

| Method | Path | Permission | Query |
|---|---|---|---|
| GET | `/` | `audit:read` | `actorUserId?, action? (prefix match), resourceType?, resourceId?, from?, to?, page, pageSize` — own organisation; `SUPER_ADMIN` sees all |

## Privacy — `/api/privacy` (Auth: user)

| Method | Path | Permission / policy | Body | Notes |
|---|---|---|---|---|
| GET | `/patients/:patientId/export` | Portal (FULL) | — | JSON export (`format: "careflow-patient-export/v1"`) with `Content-Disposition: attachment`; audited |
| POST | `/requests` | Portal (FULL) | `{ patientId, type: DATA_EXPORT|CORRECTION|ACCOUNT_DEACTIVATION|ERASURE, details? }` | 201 |
| GET | `/requests/mine` | Portal | — | |
| GET | `/requests` | `privacy:manage` | — | Organisation's requests |
| POST | `/requests/:id/resolve` | `privacy:manage` | `{ status: IN_REVIEW|COMPLETED|REJECTED, resolution }` | Deactivation COMPLETED → patient inactive, user DISABLED, sessions revoked. ERASURE cannot be COMPLETED (`UNPROCESSABLE`, requires legal review) |

## Interoperability — `/api/interop` (Auth: user)

| Method | Path | Policy | Response |
|---|---|---|---|
| GET | `/fhir/Patient/:id/everything` | Portal (FULL; released/visible data only) or clinical access | FHIR R4 `Bundle` (`type: collection`), `Content-Type: application/fhir+json`, no envelope; audited |
| GET | `/abdm/status` | user | `{ provider: "abdm-mock", connected: false, note }` |

## Admin — `/api/admin` (Auth: user; organisation of the caller)

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/facilities` | `facility:manage` \| `report:operational` | — |
| POST | `/facilities` | `facility:manage` | `{ name, code, type, phone?, email?, registrationNo?, address? }` |
| POST | `/departments` | `facility:manage` | `{ facilityId, name, code, description? }` |
| POST | `/rooms` | `facility:manage` | `{ facilityId, departmentId?, name, code }` |
| POST | `/holidays` | `facility:manage` \| `schedule:manage` | `{ facilityId, date, name }` |
| GET | `/users` | `user:manage` | `?role=` |
| POST | `/users` | `user:manage` | `{ email, displayName, phone?, password, roles: [{ role, facilityId? }] }` (SUPER_ADMIN only by super admin; PATIENT not allowed) |
| POST | `/users/:id/roles` | `user:manage` \| `role:manage` | `{ role, facilityId? }` |
| DELETE | `/users/:id/roles/:userRoleId` | `user:manage` \| `role:manage` | — (cannot remove own role) |
| POST | `/users/:id/status` | `user:manage` | `{ status: ACTIVE|DISABLED }` |
| GET | `/roles` | `user:manage` \| `role:manage` | Roles with permissions |
| POST | `/doctors` | `doctor:manage` | `{ email, password, displayName, qualifications, specialty, experienceYears, registrationNumber?, registrationCouncil?, bio?, languages?, gender?, consultationFee, teleconsultationFee?, consultationTypes[], departments: [{ departmentId, facilityId }] }` |
| PATCH | `/doctors/:id` | `doctor:manage` | Partial profile incl. `isActive` |
| GET | `/doctors/:id/schedules` | `schedule:manage` | — |
| POST | `/doctors/:id/schedules` | `schedule:manage` | `{ facilityId, departmentId, roomId?, dayOfWeek (0=Sun), startTime, endTime (HH:mm), breaks[], slotMinutes (5–240, default 15), bufferMinutes, maxAppointments?, overbookPerSlot (0–5), consultationTypes[], validFrom, validTo? }` — overlapping session → `CONFLICT` |
| DELETE | `/schedules/:scheduleId` | `schedule:manage` | Deactivates |
| POST | `/doctors/:id/leave` | `schedule:manage` | `{ type: LEAVE|HOLIDAY|SLOT_BLOCK, startAt, endAt, reason? }` |
| GET | `/reference-ranges` | `reference_range:manage` \| `facility:manage` | — |
| PUT | `/reference-ranges` | `reference_range:manage` | `{ id?, type, context?, ageMinYears, ageMaxYears, low, high, urgentLow?, urgentHigh?, low2?, high2?, unit }` |
| GET | `/settings` | `facility:manage` | Org settings |
| PATCH | `/settings` | `facility:manage` | Partial `{ bookingHorizonDays, minBookingLeadMinutes, holdMinutes (1–30), cancellationWindowHours, rescheduleWindowHours, reminderLeadHours, emergencyMessage, reviewMessage, prescriptionFooter, autoReleaseLabReports }` |
| GET | `/retention` | `privacy:manage` | Retention policies |
| PUT | `/retention` | `privacy:manage` | `{ resourceType, retainYears, action: ARCHIVE|ANONYMIZE|REVIEW, legalBasisNote? }` (configuration only — nothing is purged automatically) |

## Test routes (development/test only) — `/api/test`

Mounted only when `ENABLE_TEST_ROUTES=true`; configuration validation refuses to start if combined with `NODE_ENV=production`. Unauthenticated except where noted. **Never enable on a reachable environment.**

| Method | Path | Body / query | Purpose |
|---|---|---|---|
| GET | `/outbox` | `to?, channel?` | Mock provider outbox (rendered texts) |
| DELETE | `/outbox` | — | Clear outbox |
| POST | `/notification-failure-mode` | `{ channel, mode: none|retryable|permanent }` | Force mock failures |
| POST | `/notifications/process-due` | — | Make all QUEUED due now and dispatch |
| POST | `/notifications/receipt` | `{ providerMessageId, status: DELIVERED|READ|FAILED }` | Simulate provider receipt |
| POST | `/secure-links/expire` | `{ token }` | Expire a secure link |
| POST | `/sessions/expire-mine` | — (auth required) | Expire the caller's session |
