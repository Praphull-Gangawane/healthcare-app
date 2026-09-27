import type { ApiFailureBody, ApiSuccess, PageMeta, Paged, QueryParams } from '../types/api';

/** Error thrown for every failed API call. `code` is the stable API error code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the request never reached the server (offline, DNS, reset). Safe to retry with the same idempotency key. */
  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  idempotencyKey?: string;
  /** Break-glass reason (clinical access outside a care relationship). Audited by the API. */
  accessReason?: string;
  /** Do not redirect to the login page if the session is missing (e.g. the initial /me probe). */
  skipSessionRedirect?: boolean;
  signal?: AbortSignal;
}

const CSRF_COOKIE = 'cf_csrf';

export function readCsrfToken(): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

type Listener = () => void;
let sessionExpiredListener: Listener | null = null;
const networkListeners = new Set<(online: boolean) => void>();

export function onSessionExpired(listener: Listener | null) {
  sessionExpiredListener = listener;
}

export function subscribeNetworkStatus(listener: (reachable: boolean) => void) {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

function reportNetwork(reachable: boolean) {
  networkListeners.forEach((l) => l(reachable));
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = path.startsWith('/api') ? path : `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh: concurrent 401s share one refresh attempt. */
function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => {
          refreshing = null;
        }, 0);
      });
  }
  return refreshing;
}

const SESSION_CODES = new Set(['SESSION_EXPIRED', 'AUTH_REQUIRED']);

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  } else if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = '{}';
  }
  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.accessReason) headers['X-Access-Reason'] = encodeURIComponent(opts.accessReason);
  try {
    const res = await fetch(buildUrl(path, opts.query), { method, headers, body, credentials: 'include', signal: opts.signal ?? null });
    reportNetwork(true);
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    reportNetwork(false);
    throw new ApiError('NETWORK_ERROR', "We couldn't reach the server. Check your internet connection and try again.", 0);
  }
}

async function parseFailure(res: Response): Promise<ApiError> {
  let parsed: ApiFailureBody | null;
  try {
    parsed = (await res.json()) as ApiFailureBody;
  } catch {
    parsed = null;
  }
  if (parsed && parsed.success === false && parsed.error) {
    return new ApiError(parsed.error.code, parsed.error.message, res.status, parsed.error.details);
  }
  const code = res.status === 429 ? 'RATE_LIMITED' : res.status >= 500 ? 'INTERNAL_ERROR' : res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN';
  return new ApiError(code, 'Something went wrong. Please try again.', res.status);
}

/** Core request with one transparent session refresh on 401. */
export async function requestRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    const err = await parseFailure(res.clone());
    if (SESSION_CODES.has(err.code)) {
      const refreshed = await refreshSession();
      if (refreshed) {
        res = await send(path, opts);
      }
      if (!refreshed || res.status === 401) {
        if (!opts.skipSessionRedirect) sessionExpiredListener?.();
        throw new ApiError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
      }
    }
  }
  if (!res.ok) throw await parseFailure(res);
  return res;
}

async function envelope<T>(path: string, opts: RequestOptions): Promise<ApiSuccess<T>> {
  const res = await requestRaw(path, opts);
  const json = (await res.json()) as ApiSuccess<T>;
  return json;
}

const emptyMeta: PageMeta = { page: 1, pageSize: 0, total: 0, totalPages: 0 };

export const api = {
  get: async <T>(path: string, query?: QueryParams, extra: Omit<RequestOptions, 'method' | 'query'> = {}) =>
    (await envelope<T>(path, { ...extra, method: 'GET', query })).data,
  page: async <T>(path: string, query?: QueryParams): Promise<Paged<T>> => {
    const r = await envelope<T[]>(path, { method: 'GET', query });
    return { items: r.data, meta: r.meta ?? { ...emptyMeta, total: r.data.length } };
  },
  post: async <T>(path: string, body?: unknown, extra: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    (await envelope<T>(path, { ...extra, method: 'POST', body })).data,
  put: async <T>(path: string, body?: unknown, extra: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    (await envelope<T>(path, { ...extra, method: 'PUT', body })).data,
  patch: async <T>(path: string, body?: unknown, extra: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    (await envelope<T>(path, { ...extra, method: 'PATCH', body })).data,
  del: async <T>(path: string, extra: Omit<RequestOptions, 'method'> = {}) => (await envelope<T>(path, { ...extra, method: 'DELETE' })).data,
  upload: async <T>(path: string, form: FormData) => (await envelope<T>(path, { method: 'POST', body: form })).data,
  /** Authenticated binary fetch (documents, CSV exports). */
  blob: async (path: string, query?: QueryParams) => {
    const res = await requestRaw(path, { method: 'GET', query });
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null;
    return { blob: await res.blob(), filename: name, contentType: res.headers.get('Content-Type') ?? '' };
  },
};
