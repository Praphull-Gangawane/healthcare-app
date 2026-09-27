import type {
  AppointmentStatus,
  AppointmentType,
  DiagnosisType,
  InvestigationStatus,
  MeasurementFlag,
  OrderPriority,
  RoleKey,
  TokenStatus,
  VitalType,
} from '../types/domain';

/** Plain-language labels. Patient-facing screens never show raw enum names. */

export const appointmentTypeLabel: Record<AppointmentType, string> = {
  IN_PERSON: 'In-person visit',
  TELECONSULTATION: 'Video consultation',
  FOLLOW_UP: 'Follow-up visit',
  URGENT: 'Urgent visit',
  DIAGNOSTIC: 'Diagnostic test',
  PROCEDURE: 'Procedure',
};

export const appointmentTypeHint: Record<AppointmentType, string> = {
  IN_PERSON: 'Meet the doctor at the clinic.',
  TELECONSULTATION: 'Talk to the doctor over a secure video call.',
  FOLLOW_UP: 'A review after a previous visit.',
  URGENT: 'For problems that need attention today.',
  DIAGNOSTIC: 'Tests such as blood work or scans.',
  PROCEDURE: 'A planned procedure.',
};

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  AVAILABLE: 'Available',
  HELD: 'Reserved',
  BOOKED: 'Booked',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'With doctor',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  NO_SHOW: 'Missed',
};

export const tokenStatusLabel: Record<TokenStatus, string> = {
  WAITING: 'Waiting',
  CALLED: 'Called',
  IN_CONSULTATION: 'With doctor',
  SKIPPED: 'Skipped',
  ABSENT: 'Absent',
  COMPLETED: 'Done',
  TRANSFERRED: 'Transferred',
};

export const vitalTypeLabel: Record<VitalType, string> = {
  HEART_RATE: 'Heart rate',
  BLOOD_PRESSURE: 'Blood pressure',
  RESPIRATORY_RATE: 'Respiratory rate',
  TEMPERATURE: 'Temperature',
  OXYGEN_SATURATION: 'Oxygen saturation (SpO₂)',
  HEIGHT: 'Height',
  WEIGHT: 'Weight',
  BMI: 'BMI',
};

export const vitalUnit: Record<VitalType, string> = {
  HEART_RATE: 'bpm',
  BLOOD_PRESSURE: 'mmHg',
  RESPIRATORY_RATE: 'breaths/min',
  TEMPERATURE: '°C',
  OXYGEN_SATURATION: '%',
  HEIGHT: 'cm',
  WEIGHT: 'kg',
  BMI: 'kg/m²',
};

export const measurementFlagLabel: Record<MeasurementFlag, string> = {
  WITHIN_RANGE: 'Within range',
  REQUIRES_REVIEW: 'Requires review',
  URGENT_REVIEW: 'Urgent review',
  NOT_EVALUATED: 'Not evaluated',
};

export const diagnosisTypeLabel: Record<DiagnosisType, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  DIFFERENTIAL: 'Differential',
  PROVISIONAL: 'Provisional',
};

export const investigationStatusStaffLabel: Record<InvestigationStatus, string> = {
  ORDERED: 'Ordered',
  SCHEDULED: 'Scheduled',
  COLLECTED: 'Sample collected',
  PROCESSING: 'Processing',
  COMPLETED: 'Results entered',
  VERIFIED: 'Verified',
  CANCELLED: 'Cancelled',
};

export const investigationStatusPatientLabel: Record<InvestigationStatus, string> = {
  ORDERED: 'Test ordered',
  SCHEDULED: 'Test scheduled',
  COLLECTED: 'Sample collected',
  PROCESSING: 'Being processed',
  COMPLETED: 'Being reviewed',
  VERIFIED: 'Result ready',
  CANCELLED: 'Cancelled',
};

export const priorityLabel: Record<OrderPriority, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  STAT: 'STAT (immediate)',
};

export const genderLabel: Record<string, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  UNDISCLOSED: 'Prefer not to say',
};

export const relationshipLabel: Record<string, string> = {
  PARENT: 'I am their parent',
  CHILD: 'I am their child',
  SPOUSE: 'Spouse / partner',
  LEGAL_GUARDIAN: 'Legal guardian',
  CAREGIVER: 'Caregiver',
  OTHER: 'Other',
};

export const documentTypeLabel: Record<string, string> = {
  PRESCRIPTION: 'Prescription',
  LAB_REPORT: 'Lab report',
  IMAGING_REPORT: 'Imaging report',
  REFERRAL_LETTER: 'Referral letter',
  DISCHARGE_SUMMARY: 'Discharge summary',
  PATIENT_UPLOAD: 'Uploaded by you',
  OTHER: 'Other document',
};

export const invoiceStatusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Due',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partly paid',
  VOID: 'Void',
};

export const paymentStatusLabel: Record<string, string> = {
  PENDING: 'Pending',
  AUTHORIZED: 'Authorised',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};

export const paymentMethodLabel: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  ONLINE: 'Online',
};

export const channelLabel: Record<string, string> = {
  SMS: 'SMS text messages',
  WHATSAPP: 'WhatsApp messages',
  EMAIL: 'Email',
};

export const notificationStatusLabel: Record<string, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed',
  SKIPPED_NO_CONSENT: 'Skipped (no consent)',
  SKIPPED_NO_CONTACT: 'Skipped (no contact)',
};

export const templateLabel: Record<string, string> = {
  APPOINTMENT_CONFIRMED: 'Appointment confirmed',
  APPOINTMENT_RESCHEDULED: 'Appointment rescheduled',
  APPOINTMENT_CANCELLED: 'Appointment cancelled',
  APPOINTMENT_REMINDER: 'Appointment reminder',
  PRESCRIPTION_READY: 'Prescription ready',
  LAB_REPORT_READY: 'Report ready',
  FOLLOW_UP_REMINDER: 'Follow-up reminder',
  QUEUE_CALLED: 'Your turn',
};

export const privacyTypeLabel: Record<string, string> = {
  DATA_EXPORT: 'Copy of my data',
  CORRECTION: 'Correct my information',
  ACCOUNT_DEACTIVATION: 'Deactivate my account',
  ERASURE: 'Erase my data',
};

export const privacyStatusLabel: Record<string, string> = {
  RECEIVED: 'Received',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  REJECTED: 'Declined',
};

export const roleLabel: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super administrator',
  HOSPITAL_ADMIN: 'Hospital administrator',
  RECEPTIONIST: 'Reception',
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  LAB_TECHNICIAN: 'Lab technician',
  PHARMACIST: 'Pharmacist',
  ACCOUNTANT: 'Accounts',
  PATIENT: 'Patient',
};

export const healthProviderLabel: Record<string, string> = {
  MOCK: 'Mock Wearable',
  APPLE_HEALTHKIT: 'Apple Health',
  ANDROID_HEALTH_CONNECT: 'Health Connect',
  WEARABLE: 'Wearable',
  BLUETOOTH_DEVICE: 'Bluetooth device',
  CAMERA_PPG_DEMO: 'Camera estimate (demo)',
};

export const abnormalFlagLabel: Record<string, string> = {
  NORMAL: 'Within range',
  LOW: 'Below range',
  HIGH: 'Above range',
  ABNORMAL: 'Outside range',
  NOT_APPLICABLE: '—',
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
