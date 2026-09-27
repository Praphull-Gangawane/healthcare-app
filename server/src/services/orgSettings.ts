import { prisma } from '../lib/prisma.js';

/** Per-organization configurable policy (stored in Organization.settings JSON). */
export interface OrgSettings {
  bookingHorizonDays: number;
  minBookingLeadMinutes: number;
  holdMinutes: number;
  cancellationWindowHours: number;
  rescheduleWindowHours: number;
  reminderLeadHours: number;
  emergencyMessage: string;
  reviewMessage: string;
  prescriptionFooter: string;
  autoReleaseLabReports: boolean;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  bookingHorizonDays: 60,
  minBookingLeadMinutes: 5,
  holdMinutes: 5,
  cancellationWindowHours: 2,
  rescheduleWindowHours: 2,
  reminderLeadHours: 24,
  reviewMessage:
    'This measurement is outside the configured reference range. Please review the result with a qualified healthcare professional.',
  // Jurisdiction-specific wording must be reviewed by the deploying organization's clinical governance.
  emergencyMessage:
    'For severe or emergency symptoms, contact local emergency medical services (112 in India) or seek immediate in-person care.',
  autoReleaseLabReports: true,
  prescriptionFooter: 'This prescription is valid only when issued by the registered medical practitioner named above.',
};

const cache = new Map<string, { at: number; value: OrgSettings }>();

/** `db` lets callers inside an interactive transaction reuse its connection (no second pool checkout). */
export async function getOrgSettings(organizationId: string, db: Pick<typeof prisma, 'organization'> = prisma): Promise<OrgSettings> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const value = { ...DEFAULT_SETTINGS, ...((org?.settings as Partial<OrgSettings> | null) ?? {}) };
  cache.set(organizationId, { at: Date.now(), value });
  return value;
}

export const invalidateOrgSettings = (organizationId: string) => cache.delete(organizationId);
