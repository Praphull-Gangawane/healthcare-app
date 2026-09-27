import type { RoleKey, SessionUser } from '../types/domain';

const ROLE_HOME: [RoleKey, string][] = [
  ['SUPER_ADMIN', '/admin'],
  ['HOSPITAL_ADMIN', '/admin'],
  ['DOCTOR', '/doctor'],
  ['RECEPTIONIST', '/reception'],
  ['NURSE', '/nurse'],
  ['LAB_TECHNICIAN', '/lab'],
  ['ACCOUNTANT', '/billing'],
  ['PHARMACIST', '/pharmacy'],
  ['PATIENT', '/portal'],
];

export function homeFor(user: SessionUser | null): string {
  if (!user) return '/';
  for (const [role, path] of ROLE_HOME) if (user.roles.includes(role)) return path;
  return '/';
}

export const hasRole = (user: SessionUser | null, roles: RoleKey[]) => !!user && user.roles.some((r) => roles.includes(r));
export const hasPermission = (user: SessionUser | null, perm: string) => !!user && user.permissions.includes(perm);

/** First facility the user is scoped to (staff). */
export function primaryFacilityId(user: SessionUser | null): string | null {
  if (!user || user.facilityScope === 'ALL') return null;
  return user.facilityScope[0] ?? null;
}

/** Only allow same-origin relative redirects after login. */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}
