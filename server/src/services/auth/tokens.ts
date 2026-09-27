import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export interface AccessClaims {
  sub: string;
  sid: string;
}

export const ACCESS_COOKIE = 'cf_at';
export const REFRESH_COOKIE = 'cf_rt';
export const CSRF_COOKIE = 'cf_csrf';

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.AUTH_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m`,
    issuer: 'careflow',
    audience: 'careflow-api',
  });
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; expired: boolean };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, config.AUTH_SECRET, {
      algorithms: ['HS256'],
      issuer: 'careflow',
      audience: 'careflow-api',
    });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
      return { ok: false, expired: false };
    }
    return { ok: true, claims: { sub: decoded.sub, sid: decoded.sid } };
  } catch (err) {
    return { ok: false, expired: err instanceof jwt.TokenExpiredError };
  }
}
