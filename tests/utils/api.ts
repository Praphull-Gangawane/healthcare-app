/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from './env.js';

export interface ApiResponse<T = any> {
  method: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  text: string;
  /** Parsed JSON body (undefined for non-JSON responses). */
  body: any;
  /** Shortcut for body.data. */
  data: T;
  buffer: Buffer;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  facilityScope: string[] | 'ALL';
  doctorId: string | null;
  patientId: string | null;
}

export type AuthMode = { kind: 'none' } | { kind: 'bearer'; accessToken: string; refreshToken?: string } | { kind: 'cookie'; csrf: string | null };

export interface CallOptions {
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  multipart?: Record<string, string | number | boolean | { name: string; mimeType: string; buffer: Buffer }>;
  /** Cookie mode only: omit the X-CSRF-Token header (to test CSRF protection). */
  noCsrf?: boolean;
  idempotencyKey?: string;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Thin typed wrapper around Playwright's APIRequestContext speaking the API envelope. */
export class ApiClient {
  constructor(
    readonly ctx: APIRequestContext,
    public auth: AuthMode = { kind: 'none' },
    public user: SessionUser | null = null,
  ) {}

  async call<T = any>(method: string, path: string, opts: CallOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.auth.kind === 'bearer') headers.Authorization = `Bearer ${this.auth.accessToken}`;
    if (this.auth.kind === 'cookie' && UNSAFE.has(method) && !opts.noCsrf) {
      const csrf = this.auth.csrf ?? (await this.csrfFromCookies());
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const res = await this.ctx.fetch(url, {
      method,
      headers,
      params: opts.params,
      ...(opts.multipart ? { multipart: opts.multipart } : opts.data !== undefined ? { data: opts.data as any } : {}),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const buffer = await res.body();
    const text = buffer.toString('utf8');
    const ct = res.headers()['content-type'] ?? '';
    let body: any;
    if (/json/.test(ct)) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    return { method, url, status: res.status(), headers: res.headers(), text, body, data: body?.data as T, buffer };
  }

  get<T = any>(path: string, opts?: CallOptions) {
    return this.call<T>('GET', path, opts);
  }
  post<T = any>(path: string, data?: unknown, opts: CallOptions = {}) {
    return this.call<T>('POST', path, { ...opts, data: data ?? opts.data ?? {} });
  }
  put<T = any>(path: string, data?: unknown, opts: CallOptions = {}) {
    return this.call<T>('PUT', path, { ...opts, data: data ?? {} });
  }
  patch<T = any>(path: string, data?: unknown, opts: CallOptions = {}) {
    return this.call<T>('PATCH', path, { ...opts, data: data ?? {} });
  }
  delete<T = any>(path: string, opts?: CallOptions) {
    return this.call<T>('DELETE', path, opts);
  }

  async csrfFromCookies(): Promise<string | null> {
    const state = await this.ctx.storageState();
    return state.cookies.find((c) => c.name === 'cf_csrf')?.value ?? null;
  }

  /** A client for the same identity but with a different request context (e.g. a test-scoped one). */
  withContext(ctx: APIRequestContext): ApiClient {
    return new ApiClient(ctx, this.auth, this.user);
  }
}

// ─── Authentication helpers ───

export interface BearerSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: SessionUser;
  issuedAt: number;
}

/** POST /api/auth/login in bearer mode. Returns the raw response for negative tests. */
export function loginRaw(ctx: APIRequestContext, email: string, password: string, bearer = true) {
  return new ApiClient(ctx).post('/api/auth/login', { email, password }, { headers: bearer ? { 'X-Auth-Mode': 'bearer' } : {} });
}

export async function loginBearer(ctx: APIRequestContext, email: string, password: string): Promise<BearerSession> {
  const res = await loginRaw(ctx, email, password);
  expect(res.status, `login ${email}: ${res.text.slice(0, 300)}`).toBe(200);
  const d = res.body.data;
  return { accessToken: d.accessToken, refreshToken: d.refreshToken, csrfToken: d.csrfToken, user: d.user, issuedAt: Date.now() };
}

/**
 * Worker-level login cache (one module instance per worker process). Seeded accounts log in once
 * per worker, which keeps the suite far below the per-account login rate limit. Never call
 * logout / session-expiry helpers on a cached session — use a fresh login for those tests.
 */
const sessionCache = new Map<string, Promise<BearerSession>>();
const MAX_AGE_MS = 10 * 60_000; // access tokens live 15 minutes

export async function cachedSession(email: string, password: string): Promise<BearerSession> {
  const key = email.toLowerCase();
  const hit = sessionCache.get(key);
  if (hit) {
    const s = await hit.catch(() => null);
    if (s && Date.now() - s.issuedAt < MAX_AGE_MS) return s;
  }
  const p = (async () => {
    const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
    try {
      return await loginBearer(ctx, email, password);
    } finally {
      await ctx.dispose();
    }
  })();
  sessionCache.set(key, p);
  p.catch(() => sessionCache.delete(key));
  return p;
}

/** Cookie-mode session in its own request context (cookies + CSRF like a browser). */
export async function cookieSession(email: string, password: string) {
  const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
  const client = new ApiClient(ctx, { kind: 'cookie', csrf: null });
  const res = await client.post('/api/auth/login', { email, password });
  expect(res.status, res.text.slice(0, 300)).toBe(200);
  client.user = res.body.data.user;
  client.auth = { kind: 'cookie', csrf: res.body.data.csrfToken };
  return { client, ctx, loginResponse: res };
}
