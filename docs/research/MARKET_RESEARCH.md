# Phase 0 — Market & Compliance Research (India-first Clinic/Hospital Platform)

- Prepared: 2026-09-26
- Status: Draft for product, engineering and legal review
- Scope: Practo (Ray, Insta, Consult), Zocdoc, Doctolib, Epic MyChart, ABDM, and four India clinic/hospital products (Eka Care, HealthPlix, KareXpert, MocDoc); Indian regulations relevant to a clinic/hospital SaaS.
- Nothing in this document is legal advice. Every compliance item needs legal/regulatory validation before it is relied on.

---

## 1. Method & sources note

**How the research was done**

- Web pages were fetched directly from official product sites and official government/regulator sites. A general web search engine was **not available** in this environment, so coverage relies on known official URLs.
- All product descriptions are **paraphrased** from vendor marketing/product pages. No proprietary text, screenshots, or UI assets were copied.
- Where a fact could not be verified from a fetched page it is marked **"Not publicly documented"** (for product fields) or **"Unverified — from prior knowledge, confirm against source"** (for regulatory items). Nothing was invented to fill a field.
- Vendor claims (e.g., "HIPAA compliant", "3000+ reports") are reported as *claims*, not verified facts.

**Source classes**

| Class | Sources used | Reliability note |
|---|---|---|
| Official government / regulator | MeitY Gazette PDFs (DPDP Act commencement G.S.R. 843(E); DPDP Rules G.S.R. 846(E)), PIB press releases, TRAI regulations listing and PDFs, CDSCO Medical Device division page, NMC home page, abdm.gov.in home page | Primary. Several ABDM, NMC and MoHFW sub-pages/PDFs returned 403/404 or empty content, so some items rely on prior knowledge and are flagged |
| Official platform policy | Meta developer docs (WhatsApp opt-in, template categories, pricing, template API), WhatsApp Business Messaging Policy | Primary for WhatsApp rules |
| Official vendor product pages | practo.com, zocdoc.com, doctolib.fr/.de, mychart.org, eka.care, ekascribe.ai, healthplix.com, karexpert.com, mocdoc.com | Primary for *what the vendor claims*; does not prove functionality |
| Secondary | Wikipedia (DPDP Act article, used only to locate the official MeitY PDF) | Used only as a pointer; facts re-checked against the MeitY PDF |

**Known gaps (to close in Phase 1)**

- Full text of Telemedicine Practice Guidelines 2020 (MoHFW/NMC PDFs did not render).
- ABDM sub-pages (Scan & Share, DHIS, Health Data Management Policy PDF, sandbox docs) returned 403.
- CDSCO "Guidance Document on Medical Device Software under MDR-2017" (listed 21 Jul 2026) — PDF did not render; contents not reviewed.
- Doctolib professional product pages (robots-disallowed / lead-form only).

---

## 2. Research matrix

> Field convention: "Not publicly documented" = not found on the official pages fetched; it may still exist.

### 2.1 Practo (Practo Ray, Insta, Consult, Qikwell, Reach, Profile)

| Field | Finding |
|---|---|
| Application | Consumer marketplace (doctor discovery, booking, online consult, medicine/lab ordering) plus provider SaaS: Ray (clinic practice management), Insta (hospital management), Qikwell (queue/patient flow), Reach (patient outreach), Profile (listing), Pro app. |
| Target Users | Patients (India); individual doctors; clinics; hospitals. |
| Patient Features | Search & book; online consult by chat/call/video; digital prescription; a free follow-up window after an online consult (7 days stated); medicine ordering with delivery tracking; diagnostic test booking; health records. |
| Doctor Features | Profile/listing; online consult; Pro mobile app; EHR in Ray; templates for faster advice; post-consult chat (can be paid). |
| Reception/Admin Features | Ray: appointment scheduler, patient data management, payment collection. Insta: registration, token generation, smart-card printing, doctor scheduling, bed allocation, deposit collection, discount authorisation. |
| Appointment Features | Online instant booking ("Book"/Prime); Ray calendar; automated appointment SMS; Qikwell queue management. |
| Patient Registration | Insta OPD registration with token and smart card. Ray: Not publicly documented in detail. |
| EMR | Ray: EHR; Insta: OPD/IPD clinical records, nurse activities, discharge summaries with templates. |
| Prescription | Digital prescription (Consult); Insta prescription management with automatic pharmacy issue from doctor's prescription. |
| Lab/Diagnostic | Consumer lab test booking; Insta lab & radiology with sample barcodes, equipment interfacing, report sign-off and combined reports. |
| Notifications | SMS reminders (Ray, Insta); discharge alerts (Insta). |
| SMS | Yes — automated appointment SMS; "smart" SMS including directions (Ray). |
| WhatsApp | Not publicly documented on pages fetched. |
| Teleconsultation | Yes — chat/call/video (Consult). |
| Vitals | Insta IPD vital monitoring. |
| Device Integration | Insta: lab equipment interface, PACS, HL7 claimed. |
| Medical Document Mgmt | Consumer health records; record sharing (Ray). Detail not publicly documented. |
| Billing/Payments | Ray: online payments, billing, one-click dues collection. Insta: multi-category rate plans, patient-category pricing, deposits, multiple payment modes; insurance/TPA pre-auth and claims (XML claims for Gulf regulators HAAD/DHA mentioned). |
| Reports | Insta: very large report library claimed with custom report builder and trend analysis. Ray: performance tracking. |
| RBAC | Ray: access controls incl. IP whitelisting and two-factor authentication. Insta: Not publicly documented in detail. |
| Audit Trail | Insta: audit logging across major modules (claimed). |
| Interoperability | ABDM compliance and UHI access claimed; ICD, CPT, HCPCS, DRG, LOINC coding support (Insta); HL7 (Insta). |
| Interesting UX Patterns | Post-consult follow-up window framed as included; directions in reminder SMS. |
| Interesting Workflow Patterns | Prescription → pharmacy auto-issue; rules-based bed-charge recalculation on bed transfer. |
| Potentially Useful Feature | Bed-charge rules on transfer; prescription-driven pharmacy dispensing queue. |
| Potential IP/Branding Concern | Product names "Practo", "Ray", "Insta", "Qikwell", "Prime", "Reach" are brand names — avoid similar naming. |
| Source (URLs) | https://www.practo.com/providers ; https://www.practo.com/providers/clinics/ray ; https://www.practo.com/providers/hospitals/insta ; https://www.practo.com/consult |

### 2.2 Zocdoc (US)

| Field | Finding |
|---|---|
| Application | Patient-facing booking marketplace with provider-side distribution and communications tools. |
| Target Users | US patients; practices/providers; enterprise health systems. |
| Patient Features | Search by specialty, location and insurance plan; real-time availability; instant booking; reviews from users; in-person vs. virtual filter; mobile app. |
| Doctor Features | Listing; reputation building; booking analytics. |
| Reception/Admin Features | AI phone assistant ("Zo") for calls; patient communications (reminders, recalls, rescheduling in a single thread); intake forms; coverage verification before visit. |
| Appointment Features | Real-time availability synced to many channels (search engines, directories, practice website); bookings written back to the practice system. |
| Patient Registration | Online intake forms before visit. |
| EMR | Not an EMR; integrates with 175+ EHR/PM systems (claimed). |
| Prescription | Not publicly documented. |
| Lab/Diagnostic | Not publicly documented. |
| Notifications | Reminders, recalls, rescheduling via patient's preferred channel. |
| SMS | Implied by "preferred channels"; specifics Not publicly documented. |
| WhatsApp | Not publicly documented. |
| Teleconsultation | Virtual visits bookable via filter; delivery mechanism Not publicly documented. |
| Vitals | Not publicly documented. |
| Device Integration | Not publicly documented. |
| Medical Document Mgmt | Intake forms only. |
| Billing/Payments | Insurance coverage verification; practice pricing model Not publicly documented ("get started free"). |
| Reports | Booking source/conversion analytics, weekly. |
| RBAC | Not publicly documented. |
| Audit Trail | Not publicly documented. |
| Interoperability | EHR/PM integrations for availability and write-back. |
| Interesting UX Patterns | Insurance-first search; review aggregate shown on listings; real-time slots on search results. |
| Interesting Workflow Patterns | "Sync once, distribute everywhere" availability; intake + eligibility completed before arrival. |
| Potentially Useful Feature | Pre-visit digital intake with automated completeness check; booking-source analytics. |
| Potential IP/Branding Concern | "Zocdoc", "Zo" names; any review-star presentation mirroring theirs. |
| Source (URLs) | https://www.zocdoc.com/ ; https://www.zocdoc.com/about/ ; https://www.zocdoc.com/join |

### 2.3 Doctolib (EU — France, Germany, Italy, Netherlands)

| Field | Finding |
|---|---|
| Application | Patient booking platform plus practitioner software (scheduling, practice software incl. billing in Germany, AI assistants). |
| Target Users | Patients; practitioners; medical centres; hospitals. |
| Patient Features | Free online booking of specialists; video consultation; mobile apps. Reminders, documents, messaging, relatives: Not publicly documented on pages fetched. |
| Doctor Features | Online appointment management; all-in-one practice software (DE); AI consultation-room assistant (DE). |
| Reception/Admin Features | AI telephone assistant (DE). |
| Appointment Features | Online booking; specialist directory. |
| Patient Registration | Not publicly documented. |
| EMR | Practice software incl. treatment documentation (DE); detail Not publicly documented. |
| Prescription | Not publicly documented. |
| Lab/Diagnostic | Not publicly documented. |
| Notifications | Not publicly documented. |
| SMS | Not publicly documented. |
| WhatsApp | Not publicly documented. |
| Teleconsultation | Yes — video consultation. |
| Vitals | Not publicly documented. |
| Device Integration | Not publicly documented. |
| Medical Document Mgmt | Not publicly documented. |
| Billing/Payments | Treatment and billing module (DE, "PVS"). |
| Reports | Not publicly documented. |
| RBAC | Not publicly documented. |
| Audit Trail | Not publicly documented. |
| Interoperability | Not publicly documented. |
| Interesting UX Patterns | Security certifications surfaced to patients on public pages (ISO/IEC 27001, 27701, C5 in DE). |
| Interesting Workflow Patterns | AI phone assistant deflecting booking calls from front desk. |
| Potentially Useful Feature | Trust signals (certifications) on public booking pages. |
| Potential IP/Branding Concern | "Doctolib" name and product marks. |
| Source (URLs) | https://www.doctolib.fr/ ; https://www.doctolib.de/ ; https://info.doctolib.de/ (pro.doctolib.fr blocked by robots.txt) |

### 2.4 Epic MyChart (patient portal for Epic EHR customers)

| Field | Finding |
|---|---|
| Application | Patient portal/app tied to health systems running Epic EHR. |
| Target Users | Patients and caregivers of Epic-using organisations. |
| Patient Features | Schedule/reschedule (in-person or virtual); pre-visit tasks and electronic arrival; view medications, test results, bills; family/proxy access; one login across organisations; care companion (medication reminders, education, tracking tasks, check-ins). |
| Doctor Features | N/A (portal); provider messaging handled from EHR side. |
| Reception/Admin Features | Pre-visit paperwork shifted to patient; "reserve a spot in line" at urgent care with wait times. |
| Appointment Features | Self-scheduling; provider finder by specialty/condition/insurance, sort by availability or distance; urgent-care queue reservation. |
| Patient Registration | Pre-visit tasks online (details Not publicly documented). |
| EMR | Displays EHR data (allergies, problems, medications, results). |
| Prescription | Refill/renewal requests; ready-for-pickup notification; home delivery option. |
| Lab/Diagnostic | Test results view with notifications. |
| Notifications | User-chosen text, email or push for new messages/results. |
| SMS | Yes (text notifications). |
| WhatsApp | Not publicly documented. |
| Teleconsultation | Video visits; asynchronous e-visits (questionnaire + photos/videos); messaging with care team. |
| Vitals | Health-tracking tasks (Care Companion); detail Not publicly documented. |
| Device Integration | Not publicly documented on pages fetched. |
| Medical Document Mgmt | Record requests as PDF (selectable categories) or machine-readable format; school/daycare letters and forms. |
| Billing/Payments | View statements; online payment; payment plans. |
| Reports | Growth charts; immunisation history. |
| RBAC | Proxy access by invitation from within the portal; age-based rules Not publicly documented. |
| Audit Trail | Not publicly documented. |
| Interoperability | Linking accounts across organisations; provider-to-provider exchange network; temporary patient-generated access codes for non-affiliated providers. |
| Interesting UX Patterns | Patient-generated one-time share code; channel preference per notification type; family switcher. |
| Interesting Workflow Patterns | Asynchronous e-visit triage; queue reservation for walk-in care. |
| Potentially Useful Feature | Time-limited share code (maps well to ABDM consent); async e-visit; patient-initiated proxy invite. |
| Potential IP/Branding Concern | "Epic", "MyChart", "Happy Together", "Care Everywhere", "Share Everywhere", "Care Companion", "On My Way" are brand/feature names — do not reuse. |
| Source (URLs) | https://www.mychart.org/ ; https://www.mychart.org/l/en-us/features/schedule/ ; .../features/family/ ; .../features/view-medications-test-results-bills/ ; .../features/share/ ; .../features/virtual/ |

### 2.5 ABDM — Ayushman Bharat Digital Mission (Government of India, NHA)

> Many abdm.gov.in sub-pages returned 403 during research. Items marked (PK) are from prior knowledge and **must be confirmed** against official ABDM/NHA documents.

| Field | Finding |
|---|---|
| Application | National digital health infrastructure (registries, IDs, consent-based health information exchange) — not a product but an ecosystem our platform would integrate with. Implemented by National Health Authority. |
| Target Users | Citizens, health facilities, health professionals, software vendors (HIP/HIU/PHR integrators). |
| Patient Features | ABHA (health account) creation and use for accessing/sharing records digitally; PHR apps to manage own records; consent-based sharing. ABHA number = 14-digit KYC-verified ID; ABHA address = self-chosen handle (e.g. name@abdm); creation via Aadhaar, driving licence or mobile (vendor page). |
| Doctor Features | Healthcare Professionals Registry (HPR) covering modern and traditional systems of medicine; NMR (National Medical Register) hosted on ABDM infrastructure (nmr-nmc.abdm.gov.in). |
| Reception/Admin Features | Health Facility Registry (HFR) for hospitals, clinics, labs, imaging centres, pharmacies. Scan & Share: patient scans facility QR with an ABHA/PHR app to share profile for OPD registration and receive a queue token (PK). |
| Appointment Features | Unified Health Interface (UHI) for discovery/booking across apps (PK; Practo claims UHI access). |
| Patient Registration | ABHA-based registration; Scan & Share QR registration (PK). |
| EMR | Not an EMR; defines health record exchange. |
| Prescription | Prescriptions shareable as health records (FHIR "Prescription" record type, PK). |
| Lab/Diagnostic | Diagnostic reports as an exchangeable record type (PK). |
| Notifications | Consent requests/grants notified to patient in PHR app (PK). |
| SMS / WhatsApp | Not applicable / Not publicly documented. |
| Teleconsultation | Via UHI (PK); eSanjeevani is separate government telemedicine service. |
| Vitals | Wellness/vital records as record type (PK). |
| Device Integration | Not publicly documented. |
| Medical Document Mgmt | Health lockers / PHR apps; HIP-linked records. |
| Billing/Payments | Digital Health Incentive Scheme (DHIS) pays incentives to facilities/vendors for digital transactions (PK — scheme terms and current validity must be checked). |
| Reports | Not applicable. |
| RBAC | Not applicable (platform-level); consent artefacts define access scope, purpose and time window (PK). |
| Audit Trail | Consent manager logs consent transactions (PK). |
| Interoperability | Consent Manager + Gateway; HIP (provider) and HIU (user) roles; sandbox and certification; milestones M1 (ABHA), M2 (HIP linking/share), M3 (HIU consent-based fetch) — vendors (KareXpert, MocDoc) claim M1–M3; FHIR R4 profiles published by NRCeS (PK). |
| Interesting UX Patterns | QR-at-desk self-registration; consent PIN; granular consent (record types, date range, expiry). |
| Interesting Workflow Patterns | Care-context linking after each visit so records are discoverable; consent-first retrieval. |
| Potentially Useful Feature | Scan-to-register kiosk/QR at reception; ABHA-linked longitudinal record. |
| Potential IP/Branding Concern | Government marks (ABDM, ABHA, Ayushman Bharat, NHA logos) — use only per ABDM branding guidance; do not imply government endorsement. |
| Source (URLs) | https://abdm.gov.in/ ; https://nha.gov.in/ ; https://nmr-nmc.abdm.gov.in/nmr/v3 ; https://www.eka.care/ayushman-bharat/create-abha-health-id-card (vendor explainer) ; https://mocdoc.com/abdm-compliant-software (vendor) |

### 2.6 Eka Care (India)

| Field | Finding |
|---|---|
| Application | Patient PHR app + doctor/clinic EMR ("EkaDoc") + AI scribe (EkaScribe) + AI patient-engagement agents. |
| Target Users | Patients; doctors; clinics. |
| Patient Features | PHR app; medical-records analyser converting uploaded records into dashboards; ABHA creation (20M+ ABHAs claimed). |
| Doctor Features | Specialty-specific prescription pads; SNOMED CT / ICD-10 coded databases; AI summary, AI chat, voice-to-prescription; ambient scribe producing SOAP/clinical notes in 20+ languages; browser extension to insert notes into any web EMR. |
| Reception/Admin Features | Single queue for walk-ins and appointments; staff role restrictions. |
| Appointment Features | Appointment + walk-in queue; automated follow-up reminders. |
| Patient Registration | ABHA-linked registration (claimed); detail Not publicly documented. |
| EMR | Yes (EkaDoc). |
| Prescription | Digital prescriptions, shared via WhatsApp; voice-to-Rx. |
| Lab/Diagnostic | Lab ordering (home collection mentioned); AI scanning of lab reports. |
| Notifications | Automated reminders via WhatsApp. |
| SMS | Not publicly documented. |
| WhatsApp | Yes — reminders and prescription delivery. |
| Teleconsultation | Video consultations via third-party meeting integration. |
| Vitals | Vitals tracking. |
| Device Integration | Not publicly documented. |
| Medical Document Mgmt | PHR upload + structured extraction. |
| Billing/Payments | Billing and dues management. |
| Reports | Practice analytics (patient trends, revenue). |
| RBAC | Customisable staff role restrictions. |
| Audit Trail | Not publicly documented. |
| Interoperability | ABDM (ABHA creation, record linking); SNOMED CT, ICD-10. |
| Interesting UX Patterns | Voice-first Rx; extension-based insertion into other EMRs; multilingual. |
| Interesting Workflow Patterns | Unified walk-in/appointment queue; AI lab-report digitisation into trends. |
| Potentially Useful Feature | Unified queue; structured extraction of uploaded reports (with human verification). |
| Potential IP/Branding Concern | "Eka", "EkaDoc", "EkaScribe", "DocAssist", "Voice-2-Rx" names. |
| Source (URLs) | https://www.eka.care/ ; https://www.eka.care/s/for-doctors ; https://ekascribe.ai/ ; https://www.eka.care/ayushman-bharat/create-abha-health-id-card |

### 2.7 HealthPlix (India)

| Field | Finding |
|---|---|
| Application | Doctor EMR (web + mobile "SPOT"), hospital management module, patient app, pharma solutions. |
| Target Users | Doctors (14,000+ claimed), clinics, hospitals. |
| Patient Features | Patient app (detail Not publicly documented). |
| Doctor Features | Fast prescription writing ("30 seconds" claim); prescriptions in 14 languages; mobile EMR; module switching for doctor/nurse/admin/IPD roles. |
| Reception/Admin Features | Appointment scheduling with reminders and rescheduling. |
| Appointment Features | Scheduling, automated reminders, rescheduling. |
| Patient Registration | Long-term patient detail storage; detail Not publicly documented. |
| EMR | Yes. |
| Prescription | Yes, multilingual. |
| Lab/Diagnostic | Not publicly documented. |
| Notifications | Reminders (channel Not publicly documented). |
| SMS / WhatsApp | Not publicly documented. |
| Teleconsultation | Online consultation module. |
| Vitals | Not publicly documented. |
| Device Integration | Not publicly documented. |
| Medical Document Mgmt | Secure document upload. |
| Billing/Payments | Not publicly documented. |
| Reports | Analytics (claimed). |
| RBAC | Role-based modules (doctor, nurse, admin, IPD). |
| Audit Trail | Not publicly documented. |
| Interoperability | ABDM listed as a standard met. |
| Interesting UX Patterns | Vernacular prescriptions for patient comprehension. |
| Interesting Workflow Patterns | Mobile-first Rx for doctors consulting across locations. |
| Potentially Useful Feature | Patient-language rendering of instructions (dosage/advice) while drug names stay generic/English. |
| Potential IP/Branding Concern | "HealthPlix", "SPOT", "H.A.L.O" names. |
| Source (URLs) | https://healthplix.com/ ; https://www.healthplix.com/healthplixemr |

### 2.8 KareXpert (India)

| Field | Finding |
|---|---|
| Application | Cloud hospital platform: HIMS, EMR/EHR, LIMS, RIS/PACS, pharmacy, billing/RCM, virtual care, homecare, connected ambulance, BI, medical IoT. |
| Target Users | Hospitals and hospital chains. |
| Patient Features | Patient mobile app (detail Not publicly documented). |
| Doctor Features | Role-based physician portal; OT worklist and surgery scheduling. |
| Reception/Admin Features | Front-desk portal; online + walk-in queue management. |
| Appointment Features | Online & walk-in appointments with queue. |
| Patient Registration | ABHA ID generation (claimed). |
| EMR | Yes. |
| Prescription | Not publicly documented in detail. |
| Lab/Diagnostic | LIMS; RIS/PACS. |
| Notifications | Alerts (claimed). |
| SMS / WhatsApp | Not publicly documented. |
| Teleconsultation | Virtual care platform. |
| Vitals | Via Medical IoT (claimed). |
| Device Integration | Medical IoT (claimed). |
| Medical Document Mgmt | Not publicly documented. |
| Billing/Payments | IP/OP billing, receivables, settlements, TPA. |
| Reports | BI (claimed). |
| RBAC | Role-based access (claimed). |
| Audit Trail | Audit trail (claimed). |
| Interoperability | ABDM M1/M2/M3 certified (claimed); NABH compliance support. |
| Interesting UX Patterns | Persona portals (physician, nurse, front desk, support). |
| Interesting Workflow Patterns | Admission-to-discharge journey; OT approvals. |
| Potentially Useful Feature | Persona-specific home screens. |
| Potential IP/Branding Concern | "KareXpert" name. |
| Source (URLs) | https://www.karexpert.com/ ; https://www.karexpert.com/saas/hospital-information-management-system/ |

### 2.9 MocDoc (India)

| Field | Finding |
|---|---|
| Application | Clinic, hospital, lab (LIMS), pharmacy, dental, IVF, ophthalmology software; patient portal/app. |
| Target Users | Clinics, polyclinics, hospitals, labs, pharmacies, specialty centres. |
| Patient Features | Portal with family members; online booking; view OP/IP case sheets, lab reports, bills; personal health folder upload. |
| Doctor Features | 15+ specialty case-sheet templates; quick prescription with diagnosis-specific medicine lists, favourites, past Rx reuse, vitals charts. |
| Reception/Admin Features | Duplicate detection on mobile number entry; record merge; doctor/hospital/combined calendar views; tokens; waiting list convertible to appointments. |
| Appointment Features | Multi-view calendars; SMS/WhatsApp/email confirmations & reschedules; waitlist. |
| Patient Registration | Mobile-number lookup with duplicate detection and merge. |
| EMR | Yes; patient timeline (table + graph views); triage at check-in. |
| Prescription | Yes (see above). |
| Lab/Diagnostic | LIMS with HL7/ASTM analyzer interfacing, uni- and bi-directional. |
| Notifications | Omnichannel SMS, email, WhatsApp; end-of-day email summaries for management. |
| SMS | Yes. |
| WhatsApp | Yes. |
| Teleconsultation | Not publicly documented on pages fetched. |
| Vitals | Triage vitals, charted. |
| Device Integration | Lab analyzers (HL7/ASTM). |
| Medical Document Mgmt | Patient health-folder upload; case sheets. |
| Billing/Payments | Quick bill, doctor-controlled case-sheet billing, hybrid billing; multiple payment channels. |
| Reports | 1,000+ customisable reports (claimed); report tagging. |
| RBAC | Role-based access; IP whitelisting; auto-logout. |
| Audit Trail | Masked patient mobile numbers with unmask logging (a targeted access log). |
| Interoperability | ABDM (ABHA create/verify, HIP, HIU, consent) with compliance dashboard; ICD-10/9, LOINC, CPT, CDT. |
| Interesting UX Patterns | Masked phone numbers revealed on demand with logging; EOD summary email. |
| Interesting Workflow Patterns | Waitlist → appointment conversion; billing modes selectable per clinic workflow. |
| Potentially Useful Feature | PII masking with "break-glass" reveal logging; ABDM compliance dashboard. |
| Potential IP/Branding Concern | "MocDoc" name. |
| Source (URLs) | https://www.mocdoc.com/ ; https://mocdoc.com/clinic-management-software ; https://mocdoc.com/lims-machine-interface-integration-system ; https://mocdoc.com/abdm-compliant-software |

---

## 3. Comparison table (Y = documented on official pages fetched; N = documented as absent / not in scope; U = Unverified / not publicly documented)

| Capability | Practo | Zocdoc | Doctolib | MyChart | ABDM | Eka Care | HealthPlix | KareXpert | MocDoc |
|---|---|---|---|---|---|---|---|---|---|
| Online booking | Y | Y | Y | Y | U (UHI) | Y | Y | Y | Y |
| Walk-in queue / token | Y | U | U | Y (urgent care) | U (Scan & Share) | Y | U | Y | Y |
| Patient registration | Y | Y (intake) | U | Y | Y (ABHA) | U | U | Y | Y |
| EMR | Y | N | Y (DE) | N (portal) | N | Y | Y | Y | Y |
| e-Prescription | Y | U | U | Y (refills) | U | Y | Y | U | Y |
| Lab / LIMS | Y | U | U | Y (results) | U | Y | U | Y | Y |
| Analyzer/device interface | Y | U | U | U | U | U | U | Y (claimed) | Y |
| SMS | Y | U | U | Y | N | U | U | U | Y |
| WhatsApp | U | U | U | U | N | Y | U | U | Y |
| Teleconsultation | Y | Y | Y | Y | U | Y | Y | Y | U |
| Vitals | Y (IPD) | U | U | U | U | Y | U | Y (IoT) | Y |
| Document mgmt / PHR | Y | U | U | Y | Y | Y | Y | U | Y |
| Billing / payments | Y | U | Y (DE) | Y | N | Y | U | Y | Y |
| Insurance / TPA | Y | Y (eligibility) | U | U | N | U | U | Y | U |
| Reports / analytics | Y | Y | U | U | N | Y | Y | Y | Y |
| RBAC | Y | U | U | U (proxy) | N/A | Y | Y | Y | Y |
| Audit trail | Y | U | U | U | U | U | U | Y | Partial |
| ABDM | Y | N | N | N | — | Y | Y | Y | Y |
| Family / proxy | U | U | U | Y | U | U | U | U | Y |
| AI assistant | U | Y | Y (DE) | U | N | Y | U | Y (claimed) | U |

---

## 4. Common healthcare UX patterns & positive design patterns (generic)

1. **Phone-number-first lookup** at the front desk with duplicate detection and merge — Indian patients are identified mostly by mobile number; households often share one number, so show all matching family members.
2. **Family/dependent profiles under one account**, with explicit relationship and consent capture; patient switcher in the header.
3. **Unified queue** combining booked and walk-in patients, with visible token numbers, estimated wait, and status (checked-in → vitals → with doctor → billing → done).
4. **Pre-visit digital intake** (history, allergies, consent) completed on the patient's phone; reception sees completeness at a glance.
5. **QR-at-desk self check-in** (generic pattern; ABDM Scan & Share is one national implementation).
6. **Specialty templates + favourites + "repeat last Rx"** for fast documentation; keyboard-first and search-as-you-type drug entry.
7. **Vernacular patient instructions** on printed/shared prescriptions while clinical fields (generic drug names, dose) remain standard.
8. **Channel preference per notification type** (SMS vs WhatsApp vs email vs push) with category-level opt-out.
9. **Time-boxed, purpose-bound sharing** (share code or consent with expiry and scope) instead of permanent access.
10. **Asynchronous consult** (questionnaire + photos) for follow-ups and minor issues.
11. **PII masking with on-demand reveal and logging** for phone numbers/IDs in lists and search.
12. **Persona-specific home screens** (doctor, nurse, reception, billing, admin) rather than one menu for all.
13. **Longitudinal patient timeline** mixing visits, results, Rx and documents, with graphs for vitals and lab trends.
14. **Offline tolerance** — draft saves and queued sync for patchy clinic connectivity.
15. **Print-first outputs** (A4/A5 prescription, thermal token slip) because paper remains common in Indian OPDs.
16. **Management digest** (end-of-day summary of footfall, collections, pending dues).
17. **Trust signals** on patient-facing pages (registration number of doctor, facility registration, security certifications).
18. **Accessibility**: large tap targets, high contrast, language switcher, icon + text labels for low-literacy users.

---

## 5. Original feature opportunities (not copied from any product)

1. **Consent Ledger for patients** — a single patient-visible screen listing every consent given (DPDP notice acceptance, WhatsApp opt-in, SMS/DLT consent, ABDM consent artefacts, research use), each withdrawable in one tap, with the effect of withdrawal explained in plain language. Maps to DPDP "withdraw as easily as give".
2. **Retention & erasure scheduler** — per-record-type retention rules (clinical records vs. marketing data vs. logs), automated 48-hour pre-erasure notice, legal-hold override.
3. **Breach-readiness console** — incident log template capturing the fields a DPDP intimation needs, timers for "without delay" and 72-hour follow-up, pre-drafted patient notice.
4. **Prescription compliance linter** — checks at sign-time: RMP registration number present, generic name present, legible format, telemedicine drug-list category rules for tele-consults, controlled-substance block for tele-consults. Configurable, advisory, not a clinical decision tool.
5. **Tele-consult safety gates** — mandatory patient identity confirmation step, consent capture (with mode), first-vs-follow-up flag that drives which drug lists are enabled.
6. **Messaging router** — one outbound API that chooses WhatsApp (template category-aware, within/outside 24-hour window) or DLT SMS (header suffix, registered template ID) and records the consent basis for each send.
7. **Household-aware queue display** — families arriving together are shown as a linked group for sequential consults.
8. **"Next step" card after each visit** — follow-up date, pending tests, how to share reports back (upload link), in the patient's language.
9. **Doctor-controlled report release** — lab results held until doctor reviews abnormal flags, with configurable auto-release for normal ranges.
10. **Care-context auto-linking** to ABHA after encounter close (with patient consent), with a per-visit link status indicator.
11. **Front-desk "why is this patient waiting?"** — reason codes on queue delays feeding a simple bottleneck report.
12. **Device-agnostic vitals capture** — manual entry first, optional BLE/serial adapters later, all readings tagged with source (manual/device/patient-reported).
13. **Data-minimisation defaults** — optional fields off by default, masked identifiers, export watermarks with user and timestamp.
14. **Clinic onboarding wizard** that collects HFR ID, doctors' registration numbers, DLT entity ID, WhatsApp WABA status and flags missing items.

---

## 6. IP / copyright risk matrix

> No legal conclusions. "Needs Legal Review" indicates where counsel should look before build/launch.

| Feature | Generic Healthcare Function | Potential IP Concern | Needs Legal Review (Yes/No) | Notes |
|---|---|---|---|---|
| Product and module naming | Branding | Similarity to existing marks (e.g., names ending "-doc", "-Rx", "Ray", "Insta", "Scribe", "MyChart"-style names) | Yes | Run trademark search (India classes 9, 42, 44) before choosing names |
| Doctor listing / discovery page layout | Provider directory | Trade dress of marketplace listing cards, rating widgets | Yes | Build original visual design; avoid star-plus-percentage layouts identical to competitors |
| Patient reviews / ratings | Feedback | Presentation similarity; also consumer-law issues for reviews | Yes | Consider deferring reviews from MVP |
| Prescription pad / print layout | Prescription | Copying a vendor's template layout; also regulatory content | Yes | Design from regulatory required fields, not from competitor PDFs |
| Specialty EMR templates | Clinical documentation | Copyrighted template compilations | Yes | Author templates with clinicians in-house or use openly licensed sources |
| Drug database | Medication search | Licensed commercial drug databases; brand-name lists | Yes | Licence a database or use government sources; verify licence terms |
| Clinical terminologies (SNOMED CT, ICD-10, LOINC) | Coding | Licence terms (SNOMED CT has national licence in India via NRCeS; LOINC free with terms; ICD WHO terms) | Yes | Confirm licence scope for SaaS distribution |
| Voice-to-prescription / ambient scribe | Documentation | Patents in speech-to-structured-note pipelines; vendor marks ("Voice-2-Rx", "Scribe") | Yes | Freedom-to-operate review if built; also SaMD question |
| Time-limited record share code | Record sharing | Feature names of other vendors (e.g., "Share Everywhere"); possible patents | Yes | Use generic naming; prefer ABDM consent flow |
| Unified walk-in + appointment queue | Queue management | Low — generic practice | No | Use original UI |
| Token display screen | Queue | Low — generic | No | — |
| AI phone assistant | Call handling | Vendor marks; possible patents; telecom rules | Yes | Also TRAI A2P call declaration rules |
| Lab analyzer interface (HL7/ASTM) | Device integration | Analyzer vendors' proprietary protocol docs under NDA | Yes | Use published standards; respect NDAs |
| ABDM / ABHA logos and wording | Government integration | Use of government emblems/marks; implying endorsement | Yes | Follow ABDM branding guidance |
| WhatsApp / Meta marks | Messaging | Meta brand guidelines | Yes | Use per Meta brand resources |
| Icons, illustrations, fonts | UI | Licensing of third-party assets | Yes | Use open-licence sets with attribution records |
| Report catalogue ("1000+ reports") | Analytics | Low; copying report definitions verbatim | No | Define our own report set |
| PII masking with reveal log | Privacy | Low — generic security practice | No | — |
| Async e-visit questionnaire | Tele-consult | Copyright in question sets | Yes | Author clinically with our own content |

---

## 7. Compliance considerations for India (current status as of 2026-09-26)

> Every row: **Requires legal/regulatory validation.** "Verified" means the fact was read from the official source during this research; "Unverified (PK)" means prior knowledge that must be checked.

### 7.1 Digital Personal Data Protection Act, 2023 & DPDP Rules, 2025

| Item | Status / date | Evidence | Flag |
|---|---|---|---|
| DPDP Act commencement notification | G.S.R. 843(E), dated 13 Nov 2025 | Verified — MeitY Gazette PDF | Requires legal/regulatory validation |
| DPDP Rules, 2025 notified | G.S.R. 846(E), published 13 Nov 2025 in Gazette (PIB release reports notification on 14 Nov 2025) | Verified — MeitY Rules PDF; PIB | Requires legal/regulatory validation |
| Phase 1 — in force from 13 Nov 2025 | Act: s.1(2), s.2 (definitions), ss.18–26 (Data Protection Board), ss.35, 38–43, s.44(1),(3). Rules: 1, 2, 17–21 (Board-related) | Verified | Requires legal/regulatory validation |
| Phase 2 — from 13 Nov 2026 | Act: s.6(9) (Consent Manager registration with Board), s.27(1)(d). Rules: rule 4 (Consent Manager registration/obligations) | Verified | Requires legal/regulatory validation |
| Phase 3 — from 13 May 2027 | Act: ss.3–5, s.6 (except 9), ss.7–17 (grounds, notice, fiduciary obligations incl. security and breach, children, SDF, rights of data principals), s.27 (rest), ss.28–34, 36, 37, s.44(2). Rules: 3, 5–16, 22, 23 | Verified | Requires legal/regulatory validation |
| Consent Managers | Must be India-incorporated company; minimum net worth ₹2 crore; consent records retained ≥7 years; registration from 13 Nov 2026 | Verified — Rules PDF / PIB | Requires legal/regulatory validation |
| Breach notification | Inform affected data principals without delay in plain language; intimate Board without delay and give detailed report within 72 hours (applicable from 13 May 2027) | Verified — Rules PDF | Requires legal/regulatory validation |
| Security safeguards / logs | Reasonable safeguards incl. logs; retain logs and personal data needed for audit for at least one year | Verified (summary) — Rules PDF | Requires legal/regulatory validation |
| Erasure after inactivity | For specified classes, 48-hour prior notice before erasure | Verified (summary) — Rules PDF | Requires legal/regulatory validation |
| Children's data | Verifiable parental consent (via ID tokens/DigiLocker-type services); exemptions for healthcare/clinical and mental-health establishments for care/safety purposes | Verified (summary) — Rules PDF / PIB | Requires legal/regulatory validation |
| Grievance redressal | Respond within max. 90 days | Verified (summary) | Requires legal/regulatory validation |
| Significant Data Fiduciaries | Annual DPIA and audit; algorithmic due diligence; possible data localisation for specified data | Verified (summary) | Requires legal/regulatory validation |
| Any 2026 amendment to timelines | None found on sources fetched; reports of proposals to shorten timelines were **not verified** | Not verified | Requires legal/regulatory validation |

**Product implications**: our platform is likely a *Data Processor* for clinics (the clinic is the Data Fiduciary) and a Data Fiduciary for its own patient app/accounts — contracts, notices and roles must reflect this. Build consent capture, notice versioning, withdrawal, erasure, breach workflow and 1-year log retention from day one even though core obligations apply from 13 May 2027.

### 7.2 Telemedicine Practice Guidelines 2020 & NMC

| Item | Status | Evidence | Flag |
|---|---|---|---|
| Telemedicine Practice Guidelines (TPG) | Issued 25 Mar 2020 by the Board of Governors (in supersession of MCI) with MoHFW, as part of the Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations, 2002 | Unverified (PK) — official PDFs did not render | Requires legal/regulatory validation |
| Current status 2026 | Understood to remain the operative guidance; no replacement NMC telemedicine guideline found on sources fetched | Not verified | Requires legal/regulatory validation |
| Key TPG requirements (for design) | Only registered medical practitioners; identify patient and self; consent (implied when patient initiates; explicit otherwise); first vs follow-up consult; drug lists (List O — OTC/any mode; List A — first consult by video, e.g. re-fill types; List B — add-ons in follow-up; Prohibited — Schedule X / NDPS); e-prescription must carry RMP registration number and follow prescription format; maintain records; platforms must verify RMP registration and not let AI/chatbots counsel or prescribe | Unverified (PK) | Requires legal/regulatory validation |
| NMC RMP (Professional Conduct) Regulations, 2023 | Notified Aug 2023 (included generic-name prescribing mandate and telemedicine provisions); placed in abeyance shortly after (Aug 2023). Page exists on NMC site; current status not confirmed | Unverified (PK); NMC page did not render content | Requires legal/regulatory validation |
| Generic names / legibility | 2002 Regulations (as amended 2016): prescribe with generic names, legibly, preferably in capitals; rational prescribing | Unverified (PK) | Requires legal/regulatory validation |
| Medical records | 2002 Regulations: maintain indoor-patient records for 3 years; provide records on request within 72 hours | Unverified (PK) | Requires legal/regulatory validation |
| National Medical Register | NMR portal live on ABDM infrastructure — usable for RMP verification | Verified (link on NMC homepage) | Requires legal/regulatory validation |

### 7.3 ABDM Health Data Management Policy & integration

| Item | Status | Evidence | Flag |
|---|---|---|---|
| Health Data Management Policy (HDMP) | NDHM HDMP first version Dec 2020, later revisions; sets consent, purpose limitation, privacy-by-design, data principal rights for ABDM ecosystem; expected to be read alongside DPDP | Unverified (PK) — PDF not reachable | Requires legal/regulatory validation |
| Integration certification | Sandbox → functional testing → security audit (WASA/CERT-In empanelled auditor) → production; milestones M1/M2/M3 | Unverified (PK); vendors claim M1–M3 | Requires legal/regulatory validation |
| Scan & Share | QR-based OPD registration with ABHA; token issue | Unverified (PK) | Requires legal/regulatory validation |
| DHIS | Incentive scheme for digitised transactions; current validity/extension unknown | Unverified (PK) | Requires legal/regulatory validation |
| Standards | FHIR R4 profiles (NRCeS); SNOMED CT (national licence), LOINC, ICD | Unverified (PK) | Requires legal/regulatory validation |

### 7.4 CDSCO — Medical Devices Rules, 2017 and software

| Item | Status | Evidence | Flag |
|---|---|---|---|
| Framework | Medical devices regulated under Drugs & Cosmetics Act 1940 and MDR 2017; risk classes A–D | Verified — CDSCO page | Requires legal/regulatory validation |
| Software guidance | "Guidance Document on Medical Device Software under MDR-2017" released 21 Jul 2026 on CDSCO site | Verified (existence only; contents **not** reviewed) | Requires legal/regulatory validation |
| Implication | Administrative functions (scheduling, billing, record storage/display) are generally treated internationally (IMDRF) as non-device; features that diagnose, triage, dose-calculate, or interpret results may be SaMD. Classification of AI scribe, CDS alerts and abnormal-result flags must be assessed against the 2026 guidance | Unverified (PK) | Requires legal/regulatory validation |

### 7.5 WhatsApp Business Platform (Meta)

| Item | Status | Evidence | Flag |
|---|---|---|---|
| Opt-in | Required before business-initiated messages; opt-in must clearly state the person is opting in to WhatsApp messages and name the business; must comply with applicable law; may be collected via web, SMS, IVR, in-app, in-person/paper, or a WhatsApp thread | Verified — Meta opt-in doc; Business Messaging Policy | Requires legal/regulatory validation |
| Opt-out | Must honour all opt-out/block requests on or off WhatsApp; category-level opt-out recommended; marketing templates should have opt-out | Verified | Requires legal/regulatory validation |
| 24-hour customer service window | Free-form replies only within 24h of user's last message; outside it only approved templates | Verified | Requires legal/regulatory validation |
| Template categories | Marketing, Utility (non-promotional, tied to user's transaction/account), Authentication (OTP only, OTP button, no URLs/media/emojis). Auto-recategorisation since 1 Jul 2024; since 16 Apr 2025 no advance notice for utility→marketing changes for flagged businesses; 60-day review request window; escalating utility-sending bans for misuse | Verified | Requires legal/regulatory validation |
| Template mechanics | Approval states (Approved/Pending/Rejected/Paused); body ≤1024 chars; variables {{n}}; header/body/footer/buttons; edit ≤1/day, ≤10/month; category of approved template cannot be changed; 100 creations/hour/WABA | Verified | Requires legal/regulatory validation |
| Pricing | Per-message pricing since 1 Jul 2025; within CSW non-template and utility templates free; marketing always charged; India has own rate card; local INR billing for India from Jan 2026 | Verified | Requires legal/regulatory validation |
| Health data | Policy: do not use WhatsApp for telemedicine or to send/request health information where applicable regulations prohibit it; do not ask for full card, account or national ID numbers | Verified | Requires legal/regulatory validation |
| Human escalation | Automated experiences must offer a clear path to a human | Verified | Requires legal/regulatory validation |

**Design implication**: appointment reminders and "report ready" notices are candidates for Utility; health-camp or package promotions are Marketing. Avoid putting diagnoses/results in message bodies — send a secure link with login. Keep opt-in records per patient, per clinic (business name), per category.

### 7.6 TRAI — DLT & TCCCPR (commercial SMS)

| Item | Status | Evidence | Flag |
|---|---|---|---|
| Base regulation | TCCCPR 2018 (19 Jul 2018); amendments 21 Dec 2018 | Verified — TRAI listing | Requires legal/regulatory validation |
| Second Amendment 2025 | Released 12 Feb 2025. Categories: Promotional (explicit digital consent; opt-out in message), Service (existing customers inferred consent; new recipients explicit consent), Transactional (response to customer-initiated transaction within ~30 min, e.g., OTP/confirmation; no consent), Government. Header suffixes -P/-S/-T/-G. Templates: ≥30% fixed content, pre-tagged variables, one template per header. URLs/APKs/OTT links/call-back numbers must be whitelisted. Digital consent acquisition via DLT (127xxx short code); 90-day re-acquisition bar after revocation. Most provisions 30 days, header/template items 60 days from publication. Penalties: 15-day bar then 1-year disconnection/blacklisting | Verified — TRAI PDF | Requires legal/regulatory validation |
| Third Amendment 2026 | Released **18 Sep 2026**; staggered effect (≈30/60/90 days). Clarifies OTP-type messages as service with 7-day renewable explicit consent (interpretation needs confirmation); misused headers/templates to be suspended within 6 hours of noticing; credential reset within 3 business days; blacklisting thresholds; A2P call declaration of CLI ranges; AI/ML UCC detection; appeal mechanism; states that TCCCPR consent is distinct from DPDP consent | Verified (summary of PDF) — **very recent; interpretation must be confirmed** | Requires legal/regulatory validation |
| Operational requirements for us | Each clinic (or our platform as principal entity, depending on model) needs DLT entity registration, headers with correct suffix, registered content templates with variable tags, whitelisted URLs, consent records; choice between clinic-owned vs platform-owned headers is a key decision | Derived | Requires legal/regulatory validation |

### 7.7 Other items to evaluate (not researched in depth)

- IT Act 2000 s.43A / SPDI Rules 2011 (being superseded by DPDP on Phase 3) — Requires legal/regulatory validation.
- CERT-In Directions (28 Apr 2022): 6-hour incident reporting, 180-day log retention in India, NTP sync — Unverified (PK) — Requires legal/regulatory validation.
- Clinical Establishments Act 2010 / state rules (record keeping, display of rates) — Requires legal/regulatory validation.
- Drugs & Cosmetics Rules on prescription/dispensing of scheduled drugs (for pharmacy module) — Requires legal/regulatory validation.
- GST invoicing and e-invoicing thresholds for billing module — Requires legal/regulatory validation.
- PCPNDT Act (if ultrasound/radiology), MTP Act, Mental Healthcare Act 2017 confidentiality — Requires legal/regulatory validation.
- NABH digital health standards (optional accreditation alignment) — Requires legal/regulatory validation.

---

## 8. Recommended MVP scope

**Target**: single- and multi-doctor OPD clinics in India (1–20 doctors, 1–3 locations). Hospital IPD later.

### In scope (MVP)

1. **Tenant & facility setup** — clinic profile, locations, doctors with RMP registration number (manual entry + optional NMR verification later), HFR ID field, working hours.
2. **RBAC** — roles: Owner/Admin, Doctor, Reception, Nurse/Vitals, Billing; permission matrix; 2FA for admins/doctors.
3. **Audit trail** — immutable log of reads/writes on patient data, logins, exports, consent changes, PII reveal; ≥1 year retention (DPDP rule) — confirm CERT-In requirement.
4. **Patient registration** — mobile-first lookup, family members under one phone, duplicate detection/merge, optional ABHA number/address fields (no ABDM API yet), DPDP-style notice + consent capture with versioning.
5. **Appointments & queue** — slot calendar per doctor, walk-in tokens, unified queue with status stages, reschedule/cancel, waitlist.
6. **Vitals** — manual entry with units and ranges, trend charts; source tagging.
7. **EMR (OPD)** — chief complaint, history, examination, diagnosis (ICD-10 search subject to licence), notes; a small set of in-house authored templates; patient timeline.
8. **e-Prescription** — generic-name-first drug entry, dose/frequency/duration, advice in English + one regional language, doctor registration number and signature block, A4/A5 print and PDF; compliance linter (advisory).
9. **Documents** — upload/scan reports and images, tag by type/date, view in timeline.
10. **Billing** — consultation/procedure price list, invoice/receipt, discounts with reason, payment modes (cash/UPI/card recorded; payment gateway optional), dues; GST fields configurable.
11. **Notifications** — messaging router abstraction; SMS via DLT-registered templates; WhatsApp utility templates (appointment confirmation/reminder, "report available" with secure link); opt-in/out ledger per channel and category.
12. **Reports** — daily footfall, collections, doctor-wise visits, no-shows, dues; end-of-day summary.
13. **Privacy features** — PII masking in lists, export watermarking, data-subject request log (access/correction/erasure), retention config.
14. **Patient web view (lite)** — secure link/OTP to view own prescription and bills.

### Out of scope for MVP (planned later)

- ABDM M1/M2/M3 integration and Scan & Share (Phase 2 — needs sandbox, certification, security audit).
- Teleconsultation (Phase 2 — requires TPG workflow gates: identity, consent, drug-list logic).
- IPD, bed management, OT, nursing charts, discharge summaries.
- Pharmacy inventory/dispensing; LIMS and analyzer interfacing; RIS/PACS.
- Insurance/TPA, PM-JAY claims.
- AI scribe, voice Rx, clinical decision support, abnormal-result interpretation (pending CDSCO SaMD assessment).
- Public doctor marketplace, reviews/ratings.
- Marketing campaigns (WhatsApp marketing templates, promotional SMS).
- Device/BLE vitals integration.
- Native mobile apps (responsive web first).

### Pre-build decisions needing input

- Platform role under DPDP (processor for clinics vs. fiduciary for patient app) and contract templates.
- DLT/WABA ownership model (clinic-owned vs platform-owned sender identity).
- Terminology and drug-database licensing.
- Data residency (India region hosting).
