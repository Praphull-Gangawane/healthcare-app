import { prisma } from '../../lib/prisma.js';
import type { PermissionKey, RoleKey } from '../../config/rbac.js';

/** The authenticated actor for a request, with resolved permissions and scopes. */
export interface Principal {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  organizationId: string | null;
  roles: RoleKey[];
  permissions: Set<PermissionKey>;
  /** Facility ids the staff grants apply to; 'ALL' when a role is organization-wide. */
  facilityScope: string[] | 'ALL';
  doctorId: string | null;
  selfPatientId: string | null;
}

export const hasPermission = (p: Principal, perm: PermissionKey) => p.permissions.has(perm);
export const hasRole = (p: Principal, role: RoleKey) => p.roles.includes(role);
export const isPatientOnly = (p: Principal) => p.roles.length > 0 && p.roles.every((r) => r === 'PATIENT');

export function inFacilityScope(p: Principal, facilityId: string): boolean {
  return p.facilityScope === 'ALL' || p.facilityScope.includes(facilityId);
}

export async function loadPrincipal(userId: string, sessionId: string): Promise<Principal | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      doctorProfile: { select: { id: true } },
      patientSelf: { select: { id: true } },
    },
  });
  if (!user || user.status === 'DISABLED') return null;

  const roles = new Set<RoleKey>();
  const permissions = new Set<PermissionKey>();
  const facilities = new Set<string>();
  let orgWide = false;
  for (const ur of user.roles) {
    roles.add(ur.role.key as RoleKey);
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
    if (ur.role.key === 'PATIENT') continue;
    if (ur.facilityId) facilities.add(ur.facilityId);
    else orgWide = true;
  }

  return {
    userId: user.id,
    sessionId,
    email: user.email,
    displayName: user.displayName,
    organizationId: user.organizationId,
    roles: [...roles],
    permissions,
    facilityScope: orgWide ? 'ALL' : [...facilities],
    doctorId: user.doctorProfile?.id ?? null,
    selfPatientId: user.patientSelf?.id ?? null,
  };
}

export function serializePrincipal(p: Principal) {
  return {
    id: p.userId,
    email: p.email,
    displayName: p.displayName,
    organizationId: p.organizationId,
    roles: p.roles,
    permissions: [...p.permissions].sort(),
    facilityScope: p.facilityScope,
    doctorId: p.doctorId,
    patientId: p.selfPatientId,
  };
}
