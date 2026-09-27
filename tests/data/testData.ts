import { E2E_PASSWORD } from '../utils/env.js';

/**
 * Deterministic fixtures that match server/prisma/seed.ts. Credentials come from the environment
 * (E2E_*_EMAIL / E2E_PASSWORD) with defaults equal to the seed.
 */
const account = (envKey: string, fallback: string) => ({ email: process.env[envKey] ?? fallback, password: E2E_PASSWORD });

export const ACCOUNTS = {
  patient: account('E2E_PATIENT_EMAIL', 'patient.demo@example.test'),
  patient2: account('E2E_PATIENT2_EMAIL', 'patient2.demo@example.test'),
  doctor: account('E2E_DOCTOR_EMAIL', 'doctor.test@example.test'),
  demoDoctor: account('E2E_DEMO_DOCTOR_EMAIL', 'doctor.demo@example.test'),
  reception: account('E2E_RECEPTION_EMAIL', 'reception.demo@example.test'),
  receptionLakeview: account('E2E_RECEPTION_LVH_EMAIL', 'reception.lakeview@example.test'),
  nurse: account('E2E_NURSE_EMAIL', 'nurse.demo@example.test'),
  lab: account('E2E_LAB_EMAIL', 'lab.demo@example.test'),
  pharmacist: account('E2E_PHARMACIST_EMAIL', 'pharmacist.demo@example.test'),
  accountant: account('E2E_ACCOUNTANT_EMAIL', 'accountant.demo@example.test'),
  admin: account('E2E_ADMIN_EMAIL', 'admin.demo@example.test'),
  superadmin: account('E2E_SUPERADMIN_EMAIL', 'superadmin.demo@example.test'),
} as const;

export type Role = keyof typeof ACCOUNTS;

export const TEST_PATIENT = { ...ACCOUNTS.patient, fullName: 'Priya Demo-Patient', dependentName: 'Anika Demo-Patient' };
/** Dedicated booking doctor: bookable 00:00–23:59 every day, no seeded appointments. */
export const TEST_DOCTOR = { ...ACCOUNTS.doctor, displayName: 'Dr. Neel Sahasrabuddhe', searchName: 'Neel' };
/** Seeded doctor at the same facility, used for queue isolation/transfers (not otherwise used by tests). */
export const QUEUE_DOCTOR = { displayName: 'Dr. Rohan Deshmane', searchName: 'Rohan' };
export const DEMO_DOCTOR = { ...ACCOUNTS.demoDoctor, displayName: 'Dr. Asha Varkey', searchName: 'Asha' };
export const TEST_RECEPTIONIST = { ...ACCOUNTS.reception, displayName: 'Demo Receptionist' };
export const TEST_ADMIN = { ...ACCOUNTS.admin, displayName: 'Demo Hospital Admin' };
export const TEST_DEPARTMENT = { name: 'General Medicine', code: 'GM', facilityCode: 'RSC', facilityName: 'Riverside Demo Clinic' };
export const LAKEVIEW = { code: 'LVH', name: 'Lakeview Demo Hospital' };
export const TEST_APPOINTMENT = { reason: 'Automated test visit - routine review', type: 'IN_PERSON' as const };
/** Strong password satisfying the policy (10+ chars, upper, lower, digit). */
export const STRONG_PASSWORD = 'Str0ngTestPass!';
