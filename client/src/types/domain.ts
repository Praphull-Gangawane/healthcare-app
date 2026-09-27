import type { DecimalString } from './api';

export type RoleKey =
  | 'SUPER_ADMIN'
  | 'HOSPITAL_ADMIN'
  | 'RECEPTIONIST'
  | 'DOCTOR'
  | 'NURSE'
  | 'LAB_TECHNICIAN'
  | 'PHARMACIST'
  | 'ACCOUNTANT'
  | 'PATIENT';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: RoleKey[];
  permissions: string[];
  facilityScope: 'ALL' | string[];
  doctorId: string | null;
  patientId: string | null;
  organizationId: string | null;
}

export interface AppConfig {
  appName: string;
  demoMode: boolean;
  currency: string;
  timezone: string;
  emergencyNumber: string;
}

export type Gender = 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';
export type AppointmentType = 'IN_PERSON' | 'TELECONSULTATION' | 'FOLLOW_UP' | 'URGENT' | 'DIAGNOSTIC' | 'PROCEDURE';
export type AppointmentStatus =
  | 'AVAILABLE'
  | 'HELD'
  | 'BOOKED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'WAITING'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'NO_SHOW';

export interface Address {
  id?: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
  country?: string;
}

export interface FacilitySummary {
  id: string;
  name: string;
  code: string;
  type: string;
  phone?: string | null;
  address?: Address | null;
  departments: { id: string; name: string; code: string }[];
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  facility: { id: string; name: string };
  doctorCount: number;
}

export interface Slot {
  startAt: string;
  endAt: string;
  localTime: string;
  status: 'AVAILABLE' | 'FULL' | 'PAST' | 'BLOCKED';
  capacity: number;
  booked: number;
  scheduleId: string;
  facilityId: string;
  departmentId: string;
  roomId: string | null;
}

export interface Doctor {
  id: string;
  displayName: string;
  qualifications: string;
  specialty: string;
  experienceYears: number;
  registrationNumber: string | null;
  registrationCouncil: string | null;
  bio: string | null;
  languages: string[];
  gender: Gender | null;
  consultationFee: DecimalString;
  teleconsultationFee: DecimalString | null;
  consultationTypes: AppointmentType[];
  photoUrl: string | null;
  departments: {
    department: { id: string; name: string; code: string };
    facility: { id: string; name: string; code: string; type: string; address: { city: string; state: string; line1: string } | null };
  }[];
  nextAvailableSlot?: Slot | null;
}

export interface PatientRef {
  id: string;
  uhid: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
}

export interface Patient extends PatientRef {
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  bloodGroup: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface PatientDetail extends Patient {
  age: number;
  isMinor: boolean;
  address: Address | null;
  customFields: Record<string, unknown>;
  contacts: { id: string; name: string; relationship: string; phone: string; isEmergency: boolean }[];
}

export interface DuplicateCandidate {
  id: string;
  uhid: string;
  fullName: string;
  dateOfBirth: string;
  gender?: Gender;
  mobile: string | null;
  email?: string | null;
}

export interface Dependent {
  proxyId: string;
  relationship: string;
  status: 'ACTIVE' | 'PENDING' | 'REVOKED';
  accessLevel: string;
  patient: Patient;
}

export interface Appointment {
  id: string;
  appointmentNumber: string;
  facilityId: string;
  departmentId: string;
  doctorId: string;
  patientId: string;
  type: AppointmentType;
  status: AppointmentStatus;
  source: string;
  startAt: string;
  endAt: string;
  isWalkIn: boolean;
  reason: string | null;
  holdExpiresAt: string | null;
  cancelReason: string | null;
  doctor: { id: string; displayName: string; specialty: string };
  department: { id: string; name: string };
  facility: { id: string; name: string; timezone: string };
  patient: PatientRef;
  queueToken: { id: string; tokenNumber: number; status: TokenStatus; queueId: string } | null;
  intake: { id: string; submittedAt: string } | null;
  encounter: { id: string; status: EncounterStatus } | null;
  history?: { id: string; fromStatus: string | null; toStatus: string; changedAt: string; reason: string | null }[];
}

export interface Intake {
  id: string;
  chiefComplaint: string;
  symptoms: string[];
  symptomDuration: string | null;
  existingConditions: string | null;
  allergiesText: string | null;
  currentMedications: string | null;
  submittedAt: string;
}

export type TokenStatus = 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'SKIPPED' | 'ABSENT' | 'COMPLETED' | 'TRANSFERRED';

export interface QueueTokenRow {
  id: string;
  queueId: string;
  tokenNumber: number;
  status: TokenStatus;
  priority: number;
  recallCount: number;
  createdAt: string;
  calledAt: string | null;
  patient: PatientRef;
  appointment: { id: string; appointmentNumber: string; type: AppointmentType; startAt: string; isWalkIn: boolean; status: AppointmentStatus; reason: string | null } | null;
}

export interface QueueView {
  queue: { id: string; status: string; doctor: string; room: { name: string; code: string } | null } | null;
  date: string;
  nowServing: QueueTokenRow | null;
  next: QueueTokenRow | null;
  waitingCount: number;
  avgWaitMinutes: number | null;
  tokens: QueueTokenRow[];
}

export interface PublicQueueDisplay {
  doctor: string;
  room: string | null;
  nowServing: number | null;
  upNext: number[];
  waitingCount: number;
}

export type EncounterStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type VitalType = 'HEART_RATE' | 'BLOOD_PRESSURE' | 'RESPIRATORY_RATE' | 'TEMPERATURE' | 'OXYGEN_SATURATION' | 'HEIGHT' | 'WEIGHT' | 'BMI';
export type MeasurementFlag = 'WITHIN_RANGE' | 'REQUIRES_REVIEW' | 'URGENT_REVIEW' | 'NOT_EVALUATED';

export interface Vital {
  id: string;
  patientId: string;
  encounterId: string | null;
  type: VitalType;
  value: DecimalString;
  value2: DecimalString | null;
  unit: string;
  measuredAt: string;
  source: string;
  context: string | null;
  deviceName: string | null;
  flag: MeasurementFlag;
  status: string;
  guidance?: { message?: string; emergencyMessage?: string };
}

export interface VitalTrendPoint {
  measuredAt: string;
  value: number;
  value2: number | null;
  unit: string;
  flag: MeasurementFlag;
  source: string;
}

export type DiagnosisType = 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'PROVISIONAL';

export interface Diagnosis {
  id: string;
  description: string;
  code: string | null;
  codeSystem: string;
  type: DiagnosisType;
  createdAt: string;
}

export interface InvestigationParameter {
  code: string;
  name: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
}

export interface Investigation {
  id: string;
  code: string;
  name: string;
  category: 'BLOOD' | 'URINE' | 'IMAGING' | 'ECG' | 'OTHER';
  sampleType: string | null;
  parameters: InvestigationParameter[];
}

export type InvestigationStatus = 'ORDERED' | 'SCHEDULED' | 'COLLECTED' | 'PROCESSING' | 'COMPLETED' | 'VERIFIED' | 'CANCELLED';
export type OrderPriority = 'ROUTINE' | 'URGENT' | 'STAT';
export type AbnormalFlag = 'NORMAL' | 'LOW' | 'HIGH' | 'ABNORMAL' | 'NOT_APPLICABLE';

export interface InvestigationResult {
  id: string;
  parameterCode: string;
  parameterName: string;
  valueNumeric: DecimalString | null;
  valueText: string | null;
  unit: string | null;
  refLow: DecimalString | null;
  refHigh: DecimalString | null;
  refText: string | null;
  abnormalFlag: AbnormalFlag;
}

export interface InvestigationOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  doctorId: string;
  encounterId: string | null;
  facilityId: string;
  priority: OrderPriority;
  status: InvestigationStatus;
  clinicalNotes: string | null;
  collectedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  releasedToPatientAt: string | null;
  doctorComment: string | null;
  createdAt: string;
  investigation: Investigation;
  results: InvestigationResult[];
  report: { id: string; documentId: string | null; summary: string | null; verifiedAt: string | null } | null;
  doctor: { id: string; displayName: string };
  patient: PatientRef & { age?: number };
}

export interface LabTrendPoint {
  date: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  flag: AbnormalFlag;
  orderNumber: string;
}

export interface Medication {
  id: string;
  genericName: string;
  strength: string;
  form: string;
  route: string;
}

export interface PrescriptionItem {
  id?: string;
  medicationId?: string | null;
  medicineName: string;
  strength?: string | null;
  dose: string;
  route: string;
  frequency: string;
  timing?: string | null;
  durationDays: number;
  quantity?: string | null;
  instructions?: string | null;
  refills?: number | null;
}

export type PrescriptionStatus = 'DRAFT' | 'FINALIZED' | 'AMENDED' | 'CANCELLED';

export interface PrescriptionSnapshot {
  prescriptionNumber: string;
  version: number;
  issuedAt: string;
  amendmentReason: string | null;
  facility: { name: string; address: string | null; phone: string | null; registrationNo: string | null };
  doctor: { name: string; qualifications: string; specialty: string; registrationNumber: string | null; registrationCouncil: string | null };
  patient: { name: string; uhid: string; age: number; gender: string };
  encounter: { number: string; date: string };
  diagnoses: string[];
  allergies: string[];
  items: PrescriptionItem[];
  advice: string | null;
  investigations: string[];
  investigationNotes: string | null;
  followUpDate: string | null;
  signature: { method: string; ref: string; statement: string };
  footer: string;
}

export interface PrescriptionVersion {
  id?: string;
  versionNumber: number;
  createdAt: string;
  amendmentReason: string | null;
  contentHash: string;
  documentId: string | null;
  signatureMethod?: string;
  snapshot?: PrescriptionSnapshot;
}

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string;
  doctorId: string;
  encounterId: string;
  status: PrescriptionStatus;
  advice: string | null;
  followUpDate: string | null;
  investigationNotes: string | null;
  currentVersion: number;
  finalizedAt: string | null;
  createdAt: string;
  items?: PrescriptionItem[];
  versions: PrescriptionVersion[];
  current?: PrescriptionVersion;
  doctor?: { id: string; displayName: string; specialty: string };
  warnings: string[];
}

export interface PrescriptionListItem {
  id: string;
  prescriptionNumber: string;
  status: PrescriptionStatus;
  createdAt: string;
  finalizedAt: string | null;
  currentVersion: number;
  doctor: { displayName: string; specialty: string };
  encounter: { id: string; encounterNumber: string; startedAt: string };
  followUpDate: string | null;
  documentId: string | null;
  items: PrescriptionItem[];
}

export interface ClinicalNote {
  id: string;
  type: string;
  content: string;
  status: 'DRAFT' | 'FINAL';
  isAiDraft: boolean;
  createdAt: string;
}

export interface Encounter {
  id: string;
  encounterNumber: string;
  appointmentId: string | null;
  patientId: string;
  doctorId: string;
  facilityId: string;
  status: EncounterStatus;
  chiefComplaint: string | null;
  historyOfIllness: string | null;
  examinationFindings: string | null;
  assessmentNotes: string | null;
  planNotes: string | null;
  followUpDate: string | null;
  followUpInstructions: string | null;
  version: number;
  startedAt: string;
  completedAt: string | null;
  patient: PatientRef & { bloodGroup: string | null };
  doctor: { id: string; displayName: string; specialty: string; registrationNumber: string | null };
  appointment: { id: string; appointmentNumber: string; type: AppointmentType; startAt: string; reason: string | null; intake: Intake | null } | null;
  notes: ClinicalNote[];
  vitals: Vital[];
  diagnoses: Diagnosis[];
  prescriptions: { id: string; prescriptionNumber: string; status: PrescriptionStatus; currentVersion: number; updatedAt: string }[];
  orders: (Omit<InvestigationOrder, 'investigation' | 'results' | 'report' | 'doctor' | 'patient'> & { investigation: { code: string; name: string; category: string } })[];
}

export interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN';
}

export interface HistoryEntry {
  id: string;
  type: 'CONDITION' | 'SURGERY' | 'FAMILY_HISTORY' | 'CURRENT_MEDICATION' | 'NOTE';
  description: string;
  onsetDate: string | null;
}

export interface MedicalProfile {
  bloodGroup: string | null;
  allergies: Allergy[];
  history: HistoryEntry[];
}

export type TimelineType = 'CONSULTATION' | 'PRESCRIPTION' | 'LAB' | 'IMAGING' | 'DOCUMENT' | 'VITALS';

export interface TimelineItem {
  id: string;
  type: TimelineType;
  date: string;
  title: string;
  summary: string[];
  refId: string;
  status?: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  encounterId: string | null;
  type: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  createdAt: string;
}

export interface ConsentState {
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  optedIn: boolean;
  updatedAt: string | null;
  source: string | null;
}

export interface ConsentHistoryRow {
  id: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  optedIn: boolean;
  source: string;
  createdAt: string;
}

export type HealthProviderType = 'MOCK' | 'APPLE_HEALTHKIT' | 'ANDROID_HEALTH_CONNECT' | 'WEARABLE' | 'BLUETOOTH_DEVICE' | 'CAMERA_PPG_DEMO';

export interface HealthSource {
  id: string;
  providerType: HealthProviderType;
  deviceName: string | null;
  permissionStatus: 'NOT_REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED';
  lastSyncAt: string | null;
  permissionGrantedAt: string | null;
}

export interface HealthReading {
  id: string;
  metric: string;
  value: DecimalString;
  unit: string;
  measuredAt: string;
  context: string | null;
  validation: 'VALID' | 'INVALID' | 'WELLNESS_ESTIMATE';
  validationMessage: string | null;
  flag: MeasurementFlag;
  promotedVitalId: string | null;
  source?: { providerType: HealthProviderType; deviceName: string | null };
  guidance?: { message?: string; emergencyMessage?: string };
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: DecimalString;
  amount: DecimalString;
}

export interface Payment {
  id: string;
  amount: DecimalString;
  refundedAmount: DecimalString;
  method: 'CASH' | 'CARD' | 'UPI' | 'ONLINE';
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  facilityId: string;
  patientId: string;
  appointmentId: string | null;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIALLY_PAID' | 'VOID';
  currency: string;
  subtotal: DecimalString;
  discount: DecimalString;
  tax: DecimalString;
  total: DecimalString;
  amountPaid: DecimalString;
  issuedAt: string | null;
  createdAt: string;
  items: InvoiceItem[];
  payments: Payment[];
  patient: { id: string; uhid: string; fullName: string };
  facility: { id: string; name: string };
}

export interface NotificationRow {
  id: string;
  patientId: string | null;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  templateKey: string;
  purpose: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  logs: { id: string; provider: string; status: string; attempt: number; failureReason: string | null; sentAt: string | null }[];
}

export interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorRoles: string[];
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  reason: string | null;
  createdAt: string;
  actor: { displayName: string; email: string } | null;
}

export interface PrivacyRequest {
  id: string;
  patientId: string;
  type: 'DATA_EXPORT' | 'CORRECTION' | 'ACCOUNT_DEACTIVATION' | 'ERASURE';
  status: 'RECEIVED' | 'IN_REVIEW' | 'COMPLETED' | 'REJECTED';
  details: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  patient?: { uhid: string; fullName: string };
}

export interface StaffUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; facilityId: string | null; role: { key: RoleKey; name: string } }[];
}

export interface Schedule {
  id: string;
  facilityId: string;
  departmentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  bufferMinutes: number;
  consultationTypes: AppointmentType[];
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  facility: { name: string };
  department: { name: string };
  room: { name: string } | null;
}

export interface Leave {
  id: string;
  type: 'LEAVE' | 'HOLIDAY' | 'SLOT_BLOCK';
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface ReferenceRange {
  id: string;
  type: VitalType;
  context: string | null;
  ageMinYears: number;
  ageMaxYears: number;
  low: DecimalString;
  high: DecimalString;
  urgentLow: DecimalString | null;
  urgentHigh: DecimalString | null;
  low2: DecimalString | null;
  high2: DecimalString | null;
  unit: string;
}

export interface OrgSettings {
  bookingHorizonDays: number;
  minBookingLeadMinutes: number;
  holdMinutes: number;
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  reminderLeadHours: number;
  emergencyMessage: string;
  reviewMessage: string;
  prescriptionFooter: string;
  autoReleaseLabReports: boolean;
}

export interface BillableService {
  id: string;
  facilityId: string;
  code: string;
  name: string;
  category: 'CONSULTATION' | 'DIAGNOSTIC' | 'PROCEDURE' | 'OTHER';
  price: DecimalString;
  taxRatePct: DecimalString;
  isActive: boolean;
}

export interface AdminFacility {
  id: string;
  name: string;
  code: string;
  type: string;
  phone: string | null;
  address: Address | null;
  departments: { id: string; name: string; code: string; description: string | null }[];
  rooms: { id: string; name: string; code: string }[];
}
