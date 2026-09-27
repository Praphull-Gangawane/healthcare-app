import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { getRequestContext } from '../../lib/requestContext.js';
import { audit, type AuditActor } from '../audit.service.js';
import { burnVerify, hashPassword, verifyPassword } from './passwords.js';
import { signAccessToken } from './tokens.js';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  userId: string;
  refreshExpiresAt: Date;
}

async function issueSession(userId: string): Promise<IssuedSession> {
  const ctx = getRequestContext();
  const refreshToken = randomToken(32);
  const refreshExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent?.slice(0, 256) ?? null,
    },
  });
  return {
    accessToken: signAccessToken({ sub: userId, sid: session.id }),
    refreshToken,
    csrfToken: randomToken(18),
    userId,
    refreshExpiresAt,
  };
}

export async function login(emailInput: string, password: string): Promise<IssuedSession> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });
  if (!user) {
    await burnVerify(password);
    await audit({ action: 'auth.login', resourceType: 'User', outcome: 'FAILURE', reason: 'unknown_account' });
    throw new AppError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }
  const actor = { userId: user.id, roles: user.roles.map((r) => r.role.key), organizationId: user.organizationId };

  if (user.status === 'DISABLED') {
    await burnVerify(password);
    await audit({ actor, action: 'auth.login', resourceType: 'User', resourceId: user.id, outcome: 'DENIED', reason: 'disabled' });
    throw new AppError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ actor, action: 'auth.login', resourceType: 'User', resourceId: user.id, outcome: 'DENIED', reason: 'locked' });
    throw new AppError('ACCOUNT_LOCKED', 'This account is temporarily locked after repeated failed sign-in attempts. Please try again later.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= config.LOCKOUT_THRESHOLD;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + config.LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await audit({ actor, action: 'auth.login', resourceType: 'User', resourceId: user.id, outcome: 'FAILURE', reason: lock ? 'bad_password_locked' : 'bad_password' });
    if (lock) {
      logger.warn({ userId: user.id }, 'account locked after failed logins');
      throw new AppError('ACCOUNT_LOCKED', 'This account is temporarily locked after repeated failed sign-in attempts. Please try again later.');
    }
    throw new AppError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), status: 'ACTIVE' },
  });
  const issued = await issueSession(user.id);
  await audit({ actor, action: 'auth.login', resourceType: 'User', resourceId: user.id });
  logger.info({ userId: user.id }, 'login success');
  return issued;
}

/** Rotates the refresh token. Re-use of a revoked token revokes all of the user's sessions. */
export async function refresh(refreshToken: string): Promise<IssuedSession> {
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
  if (!session) throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  if (session.revokedAt) {
    await prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actor: { userId: session.userId, roles: [], organizationId: null }, action: 'auth.refresh_reuse_detected', resourceType: 'Session', resourceId: session.id, outcome: 'DENIED' });
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  if (session.expiresAt < new Date()) {
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== 'ACTIVE') throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return issueSession(session.userId);
}

export async function logout(sessionId: string, actor: AuditActor) {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actor, action: 'auth.logout', resourceType: 'Session', resourceId: sessionId });
}

export async function isSessionActive(sessionId: string): Promise<boolean> {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
  return !!s && !s.revokedAt && s.expiresAt > new Date();
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 'The current password is incorrect.');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() },
  });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actor: { userId, roles: [], organizationId: user.organizationId }, action: 'auth.password_changed', resourceType: 'User', resourceId: userId });
}

export { issueSession };
