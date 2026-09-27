/** Stable, client-facing error codes. Never put internal details in messages. */
export const ErrorCodes = {
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  ACCOUNT_LOCKED: 423,
  CSRF_TOKEN_INVALID: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SLOT_UNAVAILABLE: 409,
  APPOINTMENT_SLOT_UNAVAILABLE: 409,
  PATIENT_POSSIBLE_DUPLICATE: 409,
  EMAIL_ALREADY_REGISTERED: 409,
  INVALID_STATE_TRANSITION: 409,
  PRESCRIPTION_FINALIZED: 409,
  STALE_VERSION: 409,
  REQUEST_IN_PROGRESS: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  UNPROCESSABLE: 422,
  DOCTOR_UNAVAILABLE: 422,
  CANCELLATION_WINDOW_CLOSED: 422,
  RESCHEDULE_WINDOW_CLOSED: 422,
  FILE_REJECTED: 415,
  FILE_TOO_LARGE: 413,
  LINK_EXPIRED: 410,
  CONSENT_REQUIRED: 422,
  HEALTH_PERMISSION_DENIED: 403,
  HEALTH_DEVICE_UNAVAILABLE: 503,
  PAYMENT_FAILED: 402,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ErrorCodes[code];
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError('FORBIDDEN', message);
export const badRequest = (message: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', message, details);
export const invalidTransition = (from: string, to: string) =>
  new AppError('INVALID_STATE_TRANSITION', `Cannot change status from ${from} to ${to}.`);
