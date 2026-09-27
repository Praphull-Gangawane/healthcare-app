import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { getRequestContext } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AuditActor {
  userId: string;
  roles: readonly string[];
  organizationId: string | null;
}

export interface AuditEntry {
  actor?: AuditActor | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  facilityId?: string | null;
  outcome?: AuditOutcome;
  reason?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/**
 * Append-only audit trail (UPDATE/DELETE are rejected by a DB trigger). Store identifiers and
 * minimal state diffs — never full medical records, passwords, tokens or file contents.
 */
/**
 * Portal (patient/caregiver) users have no staff organization. Attribute their audit rows to the
 * organization holding their patient record so hospital auditors can see patient-side access
 * (downloads, exports, record views). Cached briefly; never used for authorization.
 */
const portalOrgCache = new Map<string, { at: number; org: string | null }>();
async function portalOrganization(userId: string, db: Tx | typeof prisma): Promise<string | null> {
  const hit = portalOrgCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.org;
  const own = await db.patient.findFirst({ where: { userId }, select: { organizationId: true } });
  const org =
    own?.organizationId ??
    (await db.patientGuardian.findFirst({ where: { proxyUserId: userId }, select: { patient: { select: { organizationId: true } } } }))?.patient.organizationId ??
    null;
  if (portalOrgCache.size > 5000) portalOrgCache.clear();
  portalOrgCache.set(userId, { at: Date.now(), org });
  return org;
}

export async function audit(entry: AuditEntry, db: Tx | typeof prisma = prisma): Promise<void> {
  const ctx = getRequestContext();
  try {
    const organizationId =
      entry.actor?.organizationId ??
      (entry.actor?.userId && entry.actor.roles.includes('PATIENT') ? await portalOrganization(entry.actor.userId, db) : null);
    await db.auditLog.create({
      data: {
        actorUserId: entry.actor?.userId ?? null,
        actorRoles: entry.actor ? [...entry.actor.roles] : [],
        organizationId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        facilityId: entry.facilityId ?? null,
        outcome: entry.outcome ?? 'SUCCESS',
        reason: entry.reason ?? null,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent?.slice(0, 256) ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  } catch (err) {
    // Audit failures must be visible to operators; inside a transaction the caller's tx fails too.
    logger.error({ err, action: entry.action, resourceType: entry.resourceType }, 'audit write failed');
    if (db !== prisma) throw err;
  }
}

export interface AuditQuery {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

export async function queryAudit(organizationId: string | null, q: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.resourceId ? { resourceId: q.resourceId } : {}),
    ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: { actor: { select: { displayName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
