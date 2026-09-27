/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request as pwRequest } from '@playwright/test';
import { ApiClient, type SessionUser } from './api.js';
import { expectOk } from './assertions.js';
import { API_BASE_URL } from './env.js';
import { randInt } from './dates.js';
import { STRONG_PASSWORD } from '../data/testData.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Letters-only unique token (patient names are normalized to letters for duplicate detection). */
export function uniqueLetters(n = 10): string {
  let s = '';
  for (let i = 0; i < n; i += 1) s += LETTERS[Math.floor(Math.random() * 26)];
  return s;
}

/** Unique run-scoped id for emails etc. */
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Unique Indian mobile in E.164. `ending` forces the last 4 digits (mock provider: 0000 → retryable
 * failure, 9999 → permanent failure); otherwise those endings are avoided.
 */
export function uniqueMobile(ending?: string): string {
  const head = `9${randInt(100_000, 999_999)}`; // 7 digits
  let tail = ending ?? String(randInt(1000, 9998)).padStart(4, '0');
  if (!ending && (tail === '0000' || tail === '9999')) tail = '1234';
  return `+91${head.slice(0, 6)}${tail}`;
}

export const uniqueEmail = (prefix = 'e2e') => `${prefix}.${uid()}@example.test`;

/** Random adult date of birth (unique-ish so duplicate detection doesn't trip on name collisions). */
export const adultDob = () => `${randInt(1950, 1999)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
export const minorDob = () => `${randInt(2012, 2022)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;

export interface NewPatientInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED';
  mobile?: string;
  email?: string;
  consents?: { sms: boolean; whatsapp: boolean; email: boolean };
  medicalProfile?: Record<string, unknown>;
  confirmNotDuplicate?: boolean;
}

export function patientPayload(o: NewPatientInput = {}) {
  return {
    firstName: o.firstName ?? `Test${uniqueLetters(8)}`,
    lastName: o.lastName ?? `Auto${uniqueLetters(6)}`,
    dateOfBirth: o.dateOfBirth ?? adultDob(),
    gender: o.gender ?? 'FEMALE',
    mobile: o.mobile ?? uniqueMobile(),
    email: o.email ?? uniqueEmail('patient'),
    consents: o.consents ?? { sms: true, whatsapp: true, email: true },
    ...(o.medicalProfile ? { medicalProfile: o.medicalProfile } : {}),
    ...(o.confirmNotDuplicate ? { confirmNotDuplicate: true } : {}),
  };
}

/** Staff-registered patient (reception). Returns the created patient record. */
export async function createPatient(staff: ApiClient, o: NewPatientInput = {}) {
  const payload = patientPayload(o);
  const res = await staff.post('/api/patients', payload);
  const data = expectOk(res, 201);
  return { ...data, mobile: data.mobile as string, email: data.email as string, input: payload } as any;
}

export interface PortalUser {
  client: ApiClient;
  user: SessionUser;
  patientId: string;
  email: string;
  password: string;
  mobile: string;
  refreshToken: string;
}

/** Registers a brand-new portal (patient) account and returns a bearer client for it. */
export async function registerPortalUser(o: NewPatientInput & { password?: string } = {}): Promise<PortalUser> {
  const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
  const anon = new ApiClient(ctx);
  const payload = { ...patientPayload(o), password: o.password ?? STRONG_PASSWORD, acceptTerms: true };
  delete (payload as any).confirmNotDuplicate;
  const res = await anon.post('/api/auth/register', payload, { headers: { 'X-Auth-Mode': 'bearer' } });
  expect(res.status, res.text.slice(0, 400)).toBe(201);
  const d = res.body.data;
  const client = new ApiClient(ctx, { kind: 'bearer', accessToken: d.accessToken, refreshToken: d.refreshToken }, d.user);
  return { client, user: d.user, patientId: d.user.patientId, email: payload.email, password: payload.password, mobile: payload.mobile, refreshToken: d.refreshToken };
}
