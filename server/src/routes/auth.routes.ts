import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config/env.js';
import { ok, parseBody } from '../lib/http.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { authenticate, requirePrincipal } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import * as auth from '../services/auth/auth.service.js';
import { hashPassword, passwordSchema } from '../services/auth/passwords.js';
import { loadPrincipal, serializePrincipal } from '../services/auth/principal.js';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../services/auth/tokens.js';
import { createPatient } from '../services/patient.service.js';
import { registerSchema } from '../validators/patient.schemas.js';
import { email } from '../validators/common.js';
import { audit } from '../services/audit.service.js';

export const authRouter = Router();

const baseCookie = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'lax' as const };

function setSessionCookies(res: Response, s: auth.IssuedSession) {
  res.cookie(ACCESS_COOKIE, s.accessToken, { ...baseCookie, path: '/', maxAge: config.ACCESS_TOKEN_TTL_MINUTES * 60_000 });
  res.cookie(REFRESH_COOKIE, s.refreshToken, { ...baseCookie, path: '/api/auth', maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
  res.cookie(CSRF_COOKIE, s.csrfToken, { httpOnly: false, secure: config.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** API clients may opt into bearer tokens (X-Auth-Mode: bearer); browsers use httpOnly cookies. */
const wantsBearer = (h: string | undefined) => h === 'bearer';

async function sessionResponse(res: Response, s: auth.IssuedSession, bearer: boolean, status = 200) {
  setSessionCookies(res, s);
  const principal = await loadPrincipal(s.userId, 'new');
  ok(res, { user: principal ? serializePrincipal(principal) : null, csrfToken: s.csrfToken, ...(bearer ? { accessToken: s.accessToken, refreshToken: s.refreshToken } : {}) }, status);
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = parseBody(z.object({ email, password: z.string().min(1).max(128) }), req);
  const session = await auth.login(body.email, body.password);
  await sessionResponse(res, session, wantsBearer(req.header('x-auth-mode')));
});

authRouter.post('/register', loginLimiter, async (req, res) => {
  const body = parseBody(registerSchema, req);
  const pw = passwordSchema.safeParse(body.password);
  if (!pw.success) throw new AppError('VALIDATION_ERROR', pw.error.issues[0]?.message ?? 'Weak password', pw.error.issues.map((i) => ({ path: 'password', message: i.message })));
  if (await prisma.user.findUnique({ where: { email: body.email } })) {
    throw new AppError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists. Try signing in instead.');
  }
  const org = body.organizationCode
    ? await prisma.organization.findUnique({ where: { code: body.organizationCode } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) throw new AppError('VALIDATION_ERROR', 'Unknown organization.');
  const patientRole = await prisma.role.findUniqueOrThrow({ where: { key: 'PATIENT' } });

  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: body.email,
        phone: body.mobile,
        displayName: [body.firstName, body.lastName].filter(Boolean).join(' '),
        passwordHash: await hashPassword(body.password),
        roles: { create: { roleId: patientRole.id } },
      },
    });
    const { password: _pw, acceptTerms: _t, organizationCode: _o, ...patientInput } = body;
    await createPatient(
      { ...patientInput, email: body.email },
      { organizationId: org.id, actor: { userId: user.id, roles: ['PATIENT'], organizationId: null }, source: 'REGISTRATION', userId: user.id, isStaff: false },
      tx,
    );
    await audit({ actor: { userId: user.id, roles: ['PATIENT'], organizationId: null }, action: 'auth.register', resourceType: 'User', resourceId: user.id }, tx);
    return user.id;
  });
  const session = await auth.login(body.email, body.password);
  void userId;
  await sessionResponse(res, session, wantsBearer(req.header('x-auth-mode')), 201);
});

authRouter.post('/refresh', async (req, res) => {
  const token = (req.cookies as Record<string, string>)[REFRESH_COOKIE] ?? (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);
  if (!token) throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  const session = await auth.refresh(token);
  await sessionResponse(res, session, wantsBearer(req.header('x-auth-mode')));
});

authRouter.post('/logout', authenticate, async (req, res) => {
  const p = requirePrincipal(req);
  await auth.logout(p.sessionId, p);
  clearSessionCookies(res);
  ok(res, { loggedOut: true });
});

authRouter.get('/me', authenticate, (req, res) => {
  ok(res, { user: serializePrincipal(requirePrincipal(req)), csrfToken: (req.cookies as Record<string, string>)[CSRF_COOKIE] ?? null });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const body = parseBody(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req);
  await auth.changePassword(requirePrincipal(req).userId, body.currentPassword, body.newPassword);
  clearSessionCookies(res);
  ok(res, { changed: true });
});
