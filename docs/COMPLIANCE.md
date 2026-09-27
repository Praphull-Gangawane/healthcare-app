# Compliance readiness — [APP_NAME] (India first)

> **This is not legal advice and not a compliance claim.** [APP_NAME] has **not** been certified, audited, registered or approved under any law, standard or programme — including the DPDP Act 2023, the Telemedicine Practice Guidelines 2020, ABDM, CDSCO/MDR 2017, ISO 27001, HIPAA or NABH. This document maps what the software provides to requirements an operator is likely to face, so that the operator's legal, clinical-governance and regulatory advisers can assess it. Every row needs legal/regulatory validation before it is relied on. Sources and verification status are in [research/MARKET_RESEARCH.md §7](research/MARKET_RESEARCH.md) (researched 2026-09-26; several items are marked *Unverified* there).

## 1. Roles

- **Clinic / hospital (operator)** — normally the *Data Fiduciary* for its patients' data; responsible for notices, lawful grounds, clinical governance and registrations.
- **Platform provider** — normally a *Data Processor* for the operator (and a fiduciary only for data it processes for its own purposes). Contracts (DPA), sub-processor lists and incident duties must reflect this.
- **Practitioners** — Registered Medical Practitioners (RMPs) responsible for consultations and prescriptions.

## 2. Digital Personal Data Protection Act 2023 and DPDP Rules 2025

Phased commencement (per research): Board provisions from 13 Nov 2025; Consent Manager registration from 13 Nov 2026; core fiduciary obligations and data-principal rights from **13 May 2027**.

| Obligation area | What the software provides | Gap / operator action |
|---|---|---|
| Notice and consent | Registration captures consent checkboxes; `NotificationConsent` records channel, purpose, opt-in/out, source, recorder and consent text, **append-only** (DB trigger), so the history is preserved | Operator must author the privacy notice (and translations), version it, and define lawful grounds for each purpose. Notice versioning in-app is not implemented |
| Withdrawal | Patients change channel preferences in the portal; a new consent row is appended; sending checks the latest row | Withdrawal of consent for *processing* (not just messaging) needs an operator process |
| Purpose limitation / minimisation | Purpose-based access (`demographics` / `appointments` / `clinical` / `billing`); least-privilege demographic projection for lists; SMS/WhatsApp bodies contain no diagnosis, results or medicines — only a secure link that requires login | Review templates with the operator's DPO |
| Data-principal rights | `GET /api/privacy/patients/:id/export` (JSON export, audited); privacy requests of type export / correction / deactivation / erasure with a staff review queue (`privacy:manage`) | Erasure is a *request workflow* only; clinical record-retention duties may override erasure — operator policy required. Response-time tracking (e.g. 90-day grievance limit) is not automated |
| Children and guardians | Dependents with guardian relationship and proxy access levels; proxy sees only linked dependents | Verifiable parental consent mechanism (DigiLocker-type) not implemented; assess the healthcare exemption with counsel |
| Security safeguards | RBAC + patient-level ABAC in the backend; httpOnly cookies, CSRF, lockout, rate limits; audit trail; immutable prescriptions; short-lived signed download URLs; redacted logs (no passwords, OTPs, tokens or record content) — see [SECURITY.md](SECURITY.md) | Encryption at rest, MFA, WAF, SIEM, malware scanning, pen-test are operator/infra items (SECURITY.md §5) |
| Log retention (≥ 1 year per Rules summary) | `AuditLog` is append-only in the database | Configure DB/log retention and archiving ≥ 1 year (and CERT-In 180-day in-India log retention if applicable) |
| Breach notification (Board: without delay + detailed report within 72 h) | Audit events for refresh-token reuse, break-glass and access denials can feed alerting | Incident-response and breach-notification runbook, contacts and templates — operator |
| Retention / erasure after purpose | `RetentionPolicy` table exists as configuration placeholders | No automated retention enforcement |
| Consent Managers | Not integrated | Evaluate once registered Consent Managers operate |
| Cross-border transfer / localisation | Deployment location is the operator's choice | Host in India if required by contract or future notification |

## 3. Telemedicine Practice Guidelines 2020 (MoHFW / Board of Governors, in supersession of MCI)

Status per research: understood to remain operative; full text could not be fetched — **verify current rules**.

| Area | Software support | Gap |
|---|---|---|
| RMP identity | Doctor profiles hold registration number and council, shown on prescriptions | Verification against the National Medical Register is manual; no automated check |
| Patient identification & consent | Teleconsultation records `patientConsentAt` on first join; UHID and demographics on screen | Operator to confirm consent wording and identity-verification procedure |
| Mode and drug lists (O / A / B / prohibited) | Not enforced — the prescription builder does not know which list a medicine falls into or whether it was a first consult by video | Implement list tagging on the medicine master and rules before enabling tele-prescribing |
| E-prescription contents | PDF carries practitioner name, registration number, facility, patient, date, medicines (generic name field), dose, frequency, duration, advice, follow-up; versioned and immutable once finalized; amendments create a new version with reason | Digital-signature / DSC signing not implemented (session attestation only). Confirm format with clinical governance |
| Record keeping | Encounters, notes, prescriptions and teleconsultation metadata are retained; video is **not** recorded | Operator retention policy |
| AI / chatbots | No AI model or chatbot is bundled. The record model supports AI-drafted notes (`isAiDraft`) that are labelled and block encounter finalization until a clinician approves them; nothing AI-generated reaches patients or prescriptions | Validate any AI integration before enabling; see §5 |

Teleconsultation uses a **mock** video provider in this release.

## 4. ABDM (Ayushman Bharat Digital Mission)

| Item | Status in this release |
|---|---|
| ABHA creation / linking, Scan & Share, HIP/HIU consent flows | **Not implemented.** `ABDM_PROVIDER=mock`; `GET /api/interop/abdm/status` reports `connected: false` |
| FHIR readiness | Mapping layer produces an R4-style bundle (`GET /api/interop/fhir/Patient/:id/everything`: Patient, Encounter, Observation, MedicationRequest, Appointment…). **Not** validated against NRCeS profiles |
| Coding | Diagnosis supports code system + code (e.g. ICD-10, SNOMED CT placeholders); no terminology server or licence bundled |
| Certification | Integration requires sandbox registration, functional testing and security audit by an empanelled auditor before production — none done |

Do not describe the product as "ABDM-compliant" or "ABDM-integrated" until certification is complete.

## 5. CDSCO — Medical Devices Rules 2017 / medical-device software

A "Guidance Document on Medical Device Software under MDR-2017" was published by CDSCO on 21 Jul 2026 (existence verified; contents **not** reviewed). Features that could be relevant to software-as-a-medical-device assessment:

| Feature | Design choice to limit risk | Assessment needed |
|---|---|---|
| Vital reference-range flags | Shows *above/below configured range* and "review with a clinician" wording; never a diagnosis; ranges are admin-configurable | Yes — classify under the 2026 guidance |
| Camera heart-rate (PPG) demo | Labelled **"DEMO / WELLNESS ESTIMATE — not a medical measurement"**; readings are stored as unvalidated patient-shared data and are not promoted to clinical vitals automatically | Must not be marketed or used as a diagnostic measurement without validation and regulatory clearance |
| Lab abnormal flags | Displays flags entered/derived from lab reference ranges; verification by lab staff before release | Yes |
| AI-drafted notes (extension point) | No model bundled; drafts are labelled and require clinician approval before finalization | Yes, before enabling any model |

Scheduling, billing, records storage and display are generally treated internationally as non-device functions; confirm for India.

## 6. Messaging: TRAI DLT (SMS) and WhatsApp Business Platform

| Requirement | Software support | Operator action |
|---|---|---|
| SMS: DLT entity, headers (-S/-T), registered templates with variable tags, whitelisted URLs | Templates are centralised (`services/notifications/templates.ts`) with a `dltTemplateId` field; secure links use one domain (`APP_BASE_URL`) | Register entity, headers and templates; fill `dltTemplateId`s; whitelist the link domain. Review the TCCCPR Third Amendment (18 Sep 2026) before launch |
| WhatsApp: official Business Platform only, opt-in naming the business, approved Utility templates, honour opt-outs, no health information where prohibited | Only a `cloud_api` adapter slot for Meta's official API exists (**no unofficial automation**); per-channel opt-in/opt-out recorded; message bodies carry no clinical content | Verified WABA, template approval, webhook with signature verification (not implemented), human-escalation path |
| Minimum content | Messages contain first name, clinic, date/time and a secure link; results, diagnoses and medicines are never included | Keep it that way when editing templates |

All providers are **mock** in this release; nothing is sent.

## 7. Other regimes to assess (not implemented or not researched in depth)

IT Act 2000 s.43A / SPDI Rules (until superseded) · CERT-In Directions 2022 (6-hour incident reporting, log retention, NTP) · Clinical Establishments Act 2010 and state rules (rate display, records) · Drugs & Cosmetics Rules for dispensing scheduled drugs (the pharmacy view is read-only dispensing support) · GST invoicing / e-invoicing (invoices hold GST fields but are **not** GST-compliant tax invoices as built) · PCPNDT, MTP and Mental Healthcare Act confidentiality where relevant · NABH digital health standards (optional).

## 8. Before any real-patient use

1. Legal review of roles, DPA, privacy notice, consent texts and retention policy.
2. Clinical-governance approval of reference ranges, review/emergency messages, prescription format and any AI feature.
3. Regulatory assessment of flags, PPG and AI features under the CDSCO 2026 software guidance.
4. DLT and WhatsApp onboarding; real providers implemented and tested.
5. Security hardening checklist ([SECURITY.md §9](SECURITY.md)) and an external penetration test.
6. `DEMO_MODE=false` only after the above; remove all seeded demo data (never seed a production database).
