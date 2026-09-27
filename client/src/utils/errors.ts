import { ApiError } from '../api/client';

export const SLOT_UNAVAILABLE_MESSAGE = 'This slot was just booked by another patient. Please select another available time.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/** Friendly, stable copy per API error code. Server messages are used only where they carry specifics. */
const FRIENDLY: Record<string, string> = {
  SLOT_UNAVAILABLE: SLOT_UNAVAILABLE_MESSAGE,
  APPOINTMENT_SLOT_UNAVAILABLE: SLOT_UNAVAILABLE_MESSAGE,
  DOCTOR_UNAVAILABLE: 'The doctor is not available at the selected time. Please choose another slot.',
  PATIENT_POSSIBLE_DUPLICATE: 'A patient with matching details may already exist.',
  FILE_REJECTED: 'This file type is not accepted. Please upload a PDF, PNG or JPEG file.',
  FILE_TOO_LARGE: 'This file is too large. Please upload a smaller file.',
  PAYMENT_FAILED: 'The payment could not be completed. No money was taken. Please try another method.',
  SESSION_EXPIRED: SESSION_EXPIRED_MESSAGE,
  AUTH_REQUIRED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  ACCOUNT_LOCKED: 'Your account is temporarily locked after several unsuccessful attempts. Please try again later.',
  FORBIDDEN: "You don't have permission to do this.",
  CSRF_TOKEN_INVALID: 'Your request could not be verified. Please refresh the page and try again.',
  HEALTH_PERMISSION_DENIED: 'Permission to read health data from this source has not been granted.',
  HEALTH_DEVICE_UNAVAILABLE: 'The health device is not available. Check that it is connected and try again.',
  PROVIDER_UNAVAILABLE: 'This service is temporarily unavailable. Please try again later.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  NETWORK_ERROR: "We couldn't reach the server. Check your internet connection and try again.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  LINK_EXPIRED: 'This link has expired. Please sign in to your account to view your records.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  REQUEST_IN_PROGRESS: 'Your previous request is still being processed. Please wait a moment.',
  STALE_VERSION: 'This record was updated elsewhere. We reloaded the latest version.',
  EMAIL_ALREADY_REGISTERED: 'An account with this email already exists. Try signing in instead.',
};

/** Codes whose server message is specific and safe to show as-is. */
const USE_SERVER_MESSAGE = new Set([
  'VALIDATION_ERROR',
  'UNPROCESSABLE',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'CANCELLATION_WINDOW_CLOSED',
  'RESCHEDULE_WINDOW_CLOSED',
  'CONSENT_REQUIRED',
  'PRESCRIPTION_FINALIZED',
  'FILE_TOO_LARGE',
  'IDEMPOTENCY_KEY_REUSED',
]);

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) {
    if (err.code === 'SLOT_UNAVAILABLE' && /expired/i.test(err.message)) return 'Your reservation expired. Please select the slot again.';
    if (err.code === 'FORBIDDEN' && err.message && !/permission to perform/i.test(err.message)) return err.message;
    if (err.code === 'VALIDATION_ERROR') {
      const first = fieldIssues(err)[0];
      if (first && err.message.startsWith('Some of the information')) return `${err.message} ${first.message}`;
      return err.message;
    }
    if (USE_SERVER_MESSAGE.has(err.code) && err.message) return err.message;
    return FRIENDLY[err.code] ?? (err.status >= 500 ? FRIENDLY.INTERNAL_ERROR ?? fallback : err.message || fallback);
  }
  return fallback;
}

export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

export interface FieldIssue {
  path: string;
  message: string;
}

export function fieldIssues(err: unknown): FieldIssue[] {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return [];
  return (err.details as unknown[]).filter(
    (d): d is FieldIssue => typeof d === 'object' && d !== null && 'message' in d && typeof (d as FieldIssue).message === 'string',
  ).map((d) => ({ path: typeof d.path === 'string' ? d.path : '', message: d.message }));
}

export const isForbidden = (err: unknown) => err instanceof ApiError && err.status === 403;
export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
