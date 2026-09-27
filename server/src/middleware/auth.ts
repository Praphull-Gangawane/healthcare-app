import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { ACCESS_COOKIE, CSRF_COOKIE, verifyAccessToken } from '../services/auth/tokens.js';
import { loadPrincipal, type Principal } from '../services/auth/principal.js';
import { isSessionActive } from '../services/auth/auth.service.js';
import type { PermissionKey } from '../config/rbac.js';
import { audit } from '../services/audit.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
    authVia?: 'cookie' | 'bearer';
  }
}

function extractToken(req: Request): { token: string; via: 'cookie' | 'bearer' } | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return { token: header.slice(7), via: 'bearer' };
  const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return cookie ? { token: cookie, via: 'cookie' } : null;
}

async function resolve(req: Request): Promise<void> {
  const found = extractToken(req);
  if (!found) throw new AppError('AUTH_REQUIRED', 'Please sign in to continue.');
  const result = verifyAccessToken(found.token);
  if (!result.ok) {
    throw result.expired
      ? new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.')
      : new AppError('AUTH_REQUIRED', 'Please sign in to continue.');
  }
  if (!(await isSessionActive(result.claims.sid))) {
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  const principal = await loadPrincipal(result.claims.sub, result.claims.sid);
  if (!principal) throw new AppError('AUTH_REQUIRED', 'Please sign in to continue.');
  req.principal = principal;
  req.authVia = found.via;
}

/** Requires a valid session. Cookie-authenticated unsafe requests must carry a matching CSRF header. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  await resolve(req);
  if (req.authVia === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
    const header = req.header('x-csrf-token');
    if (!cookie || !header || cookie !== header) {
      throw new AppError('CSRF_TOKEN_INVALID', 'Your request could not be verified. Please refresh and try again.');
    }
  }
  next();
}

export function requirePrincipal(req: Request): Principal {
  if (!req.principal) throw new AppError('AUTH_REQUIRED', 'Please sign in to continue.');
  return req.principal;
}

/** Backend authorization gate: the principal needs at least one of the listed permissions. */
export function requirePermission(...perms: PermissionKey[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const p = requirePrincipal(req);
    if (!perms.some((perm) => p.permissions.has(perm))) {
      await audit({
        actor: p,
        action: 'access.denied',
        resourceType: 'Route',
        resourceId: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`,
        outcome: 'DENIED',
        reason: `missing:${perms.join('|')}`,
      });
      throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.');
    }
    next();
  };
}
