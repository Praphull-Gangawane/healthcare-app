import { request as pwRequest } from '@playwright/test';
import { test, expect } from '../fixtures/index.js';
import { ApiClient, loginBearer, loginRaw } from '../utils/api.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { API_BASE_URL } from '../utils/env.js';
import { patientPayload, registerPortalUser, uniqueEmail } from '../utils/factories.js';
import { STRONG_PASSWORD } from '../data/testData.js';

function parseSetCookies(raw: string | undefined) {
  return (raw ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [pair = '', ...attrs] = line.split(';').map((s) => s.trim());
      const [name = '', value = ''] = pair.split('=');
      return { name, value, attrs: attrs.map((a) => a.toLowerCase()) };
    });
}

test.describe('authentication', () => {
  test('valid cookie login sets httpOnly + SameSite session cookies and no tokens in the body', async () => {
    const u = await registerPortalUser();
    const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
    const res = await loginRaw(ctx, u.email, u.password, false);
    const data = expectOk(res);
    expect(data.user.email).toBe(u.email);
    expect(data.user.roles).toEqual(['PATIENT']);
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/passwordHash/);

    const cookies = parseSetCookies(res.headers['set-cookie']);
    const at = cookies.find((c) => c.name === 'cf_at');
    const rt = cookies.find((c) => c.name === 'cf_rt');
    const csrf = cookies.find((c) => c.name === 'cf_csrf');
    expect(at?.attrs).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/']));
    expect(rt?.attrs).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/api/auth']));
    expect(csrf?.attrs).not.toContain('httponly'); // readable by the SPA for the double-submit header
    expect(csrf?.value).toBe(data.csrfToken);

    // Cookie session works for safe requests without CSRF.
    const me = await new ApiClient(ctx, { kind: 'cookie', csrf: data.csrfToken }).get('/api/auth/me');
    expect(expectOk(me).user.id).toBe(data.user.id);
    await ctx.dispose();
  });

  test('bearer login returns tokens; /me reflects roles and permissions', async () => {
    const u = await registerPortalUser();
    const s = await loginBearer(u.client.ctx, u.email, u.password);
    expect(s.accessToken.split('.')).toHaveLength(3);
    expect(s.refreshToken.length).toBeGreaterThan(20);
    const me = expectOk(await new ApiClient(u.client.ctx, { kind: 'bearer', accessToken: s.accessToken }).get('/api/auth/me'));
    expect(me.user.permissions).toEqual(expect.arrayContaining(['portal:self', 'appointment:book_self']));
    expect(me.user.permissions).not.toContain('clinical:read');
  });

  test('invalid credentials → 401 INVALID_CREDENTIALS without account enumeration', async ({ request }) => {
    const u = await registerPortalUser();
    const wrong = expectError(await loginRaw(request, u.email, 'Wrong-Password-1'), 401, 'INVALID_CREDENTIALS');
    const unknown = expectError(await loginRaw(request, uniqueEmail('nobody'), 'Wrong-Password-1'), 401, 'INVALID_CREDENTIALS');
    expect(wrong.message).toBe(unknown.message);
  });

  test('malformed login body → 400 VALIDATION_ERROR', async ({ anon }) => {
    const r = await anon.post('/api/auth/login', { email: 'not-an-email', password: '' });
    const err = expectError(r, 400, 'VALIDATION_ERROR');
    expect(JSON.stringify(err.details)).toContain('email');
  });

  test('protected routes require authentication → 401 AUTH_REQUIRED', async ({ anon }) => {
    expectError(await anon.get('/api/auth/me'), 401, 'AUTH_REQUIRED');
    expectError(await anon.get('/api/patients'), 401, 'AUTH_REQUIRED');
    const forged = new ApiClient(anon.ctx, { kind: 'bearer', accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad' });
    expectError(await forged.get('/api/auth/me'), 401, 'AUTH_REQUIRED');
  });

  test('logout revokes the session', async () => {
    const u = await registerPortalUser();
    const s = await loginBearer(u.client.ctx, u.email, u.password);
    const c = new ApiClient(u.client.ctx, { kind: 'bearer', accessToken: s.accessToken });
    expectOk(await c.get('/api/auth/me'));
    expect(expectOk(await c.post('/api/auth/logout')).loggedOut).toBe(true);
    expectError(await c.get('/api/auth/me'), 401, 'SESSION_EXPIRED');
    // Refresh with the revoked session's token is refused too.
    expectError(await c.post('/api/auth/refresh', { refreshToken: s.refreshToken }), 401, 'SESSION_EXPIRED');
  });

  test('refresh rotates tokens; reusing an old refresh token revokes every session', async () => {
    const u = await registerPortalUser();
    // Each step uses a cookie-less context so only the refresh token in the body is presented.
    const fresh = async () => new ApiClient(await pwRequest.newContext({ baseURL: API_BASE_URL }));
    const first = await loginBearer((await fresh()).ctx, u.email, u.password);
    const next = expectOk(await (await fresh()).post('/api/auth/refresh', { refreshToken: first.refreshToken }, { headers: { 'X-Auth-Mode': 'bearer' } }));
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.accessToken).not.toBe(first.accessToken);

    const bearer = async (token: string) => new ApiClient((await fresh()).ctx, { kind: 'bearer', accessToken: token });
    expectOk(await (await bearer(next.accessToken)).get('/api/auth/me'));
    // The rotated-away session no longer authenticates.
    expectError(await (await bearer(first.accessToken)).get('/api/auth/me'), 401, 'SESSION_EXPIRED');

    // Reuse detection: presenting the old refresh token again kills all of the user's sessions.
    expectError(await (await fresh()).post('/api/auth/refresh', { refreshToken: first.refreshToken }), 401, 'SESSION_EXPIRED');
    expectError(await (await bearer(next.accessToken)).get('/api/auth/me'), 401, 'SESSION_EXPIRED');
    expectError(await u.client.get('/api/auth/me'), 401, 'SESSION_EXPIRED');
    expectError(await (await fresh()).post('/api/auth/refresh', { refreshToken: next.refreshToken }), 401, 'SESSION_EXPIRED');
  });

  test('refresh without a token → 401', async ({ anon }) => {
    expectError(await anon.post('/api/auth/refresh', {}), 401, 'SESSION_EXPIRED');
    expectError(await anon.post('/api/auth/refresh', { refreshToken: 'not-a-real-token' }), 401, 'SESSION_EXPIRED');
  });

  test('cookie-authenticated unsafe requests require a matching CSRF token → 403 CSRF_TOKEN_INVALID', async () => {
    const u = await registerPortalUser();
    const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
    const login = expectOk(await loginRaw(ctx, u.email, u.password, false));
    const cookieClient = new ApiClient(ctx, { kind: 'cookie', csrf: login.csrfToken });
    const body = { ...patientPayload(), relationship: 'CHILD', dateOfBirth: '2018-01-01' };

    expectError(await cookieClient.post('/api/patients/me/dependents', body, { noCsrf: true }), 403, 'CSRF_TOKEN_INVALID');
    expectError(await cookieClient.post('/api/patients/me/dependents', body, { noCsrf: true, headers: { 'X-CSRF-Token': 'forged-token-value' } }), 403, 'CSRF_TOKEN_INVALID');
    // Safe methods don't need it; a correct token is accepted.
    expectOk(await cookieClient.get('/api/patients/me/dependents'));
    expectOk(await cookieClient.post('/api/patients/me/dependents', body), 201);
    // Bearer clients are not subject to CSRF (no ambient credentials).
    expectOk(await u.client.get('/api/auth/me'));
    await ctx.dispose();
  });

  test('expired session → 401 SESSION_EXPIRED', async ({ anon }) => {
    const u = await registerPortalUser();
    const s = await loginBearer(anon.ctx, u.email, u.password);
    const c = new ApiClient(anon.ctx, { kind: 'bearer', accessToken: s.accessToken });
    expectOk(await c.post('/api/test/sessions/expire-mine'));
    const err = expectError(await c.get('/api/auth/me'), 401, 'SESSION_EXPIRED');
    expect(err.message).toMatch(/expired/i);
    expectError(await anon.post('/api/auth/refresh', { refreshToken: s.refreshToken }), 401, 'SESSION_EXPIRED');
  });

  test('registration enforces the password policy → 400', async ({ anon }) => {
    for (const password of ['short1A', 'alllowercase123', 'ALLUPPERCASE123', 'NoDigitsInHere']) {
      const r = await anon.post('/api/auth/register', { ...patientPayload(), password, acceptTerms: true });
      const err = expectError(r, 400, 'VALIDATION_ERROR');
      expect(JSON.stringify(err.details)).toContain('password');
    }
    expectError(await anon.post('/api/auth/register', { ...patientPayload(), password: STRONG_PASSWORD }), 400, 'VALIDATION_ERROR'); // terms not accepted
  });

  test('registering an existing email → 409 EMAIL_ALREADY_REGISTERED', async ({ anon }) => {
    const u = await registerPortalUser();
    expectError(await anon.post('/api/auth/register', { ...patientPayload({ email: u.email }), password: STRONG_PASSWORD, acceptTerms: true }), 409, 'EMAIL_ALREADY_REGISTERED');
  });

  test('account locks after 5 bad passwords → 423 ACCOUNT_LOCKED (even with the right password)', async ({ anon }) => {
    const u = await registerPortalUser();
    for (let i = 1; i <= 4; i += 1) expectError(await loginRaw(anon.ctx, u.email, `Wrong-Pass-${i}`), 401, 'INVALID_CREDENTIALS');
    expectError(await loginRaw(anon.ctx, u.email, 'Wrong-Pass-5'), 423, 'ACCOUNT_LOCKED');
    expectError(await loginRaw(anon.ctx, u.email, u.password), 423, 'ACCOUNT_LOCKED');
  });

  test('login is rate limited per account → 429 RATE_LIMITED', async ({ anon }) => {
    const email = uniqueEmail('ratelimit');
    const first = await loginRaw(anon.ctx, email, 'Whatever-123');
    expectError(first, 401, 'INVALID_CREDENTIALS');
    const policy = /limit=(\d+)/.exec(first.headers['ratelimit'] ?? '')?.[1] ?? /^(\d+)/.exec(first.headers['ratelimit-policy'] ?? '')?.[1];
    const limit = Number(policy ?? 10);
    expect(limit).toBeGreaterThan(0);
    let last = first;
    for (let i = 1; i < limit; i += 1) last = await loginRaw(anon.ctx, email, 'Whatever-123');
    expect(last.status).toBe(401);
    const limited = await loginRaw(anon.ctx, email, 'Whatever-123');
    expectError(limited, 429, 'RATE_LIMITED');
    // Budget is per ip+email: another account is unaffected.
    expectError(await loginRaw(anon.ctx, uniqueEmail('other'), 'Whatever-123'), 401, 'INVALID_CREDENTIALS');
  });
});
