import { prisma } from '../../lib/prisma.js';
import type { NotificationChannel, ConsentSource } from '../../generated/prisma/client.js';
import { audit, type AuditActor } from '../audit.service.js';

export const CHANNELS: NotificationChannel[] = ['SMS', 'WHATSAPP', 'EMAIL'];
export const TRANSACTIONAL = 'TRANSACTIONAL';

export interface ConsentState {
  channel: NotificationChannel;
  optedIn: boolean;
  updatedAt: string | null;
  source: ConsentSource | null;
}

/**
 * Effective consent = latest row per channel (history is append-only). No row = not consented:
 * the system never assumes opt-in, and an opt-out is never silently reversed.
 */
export async function getConsents(patientId: string, purpose = TRANSACTIONAL): Promise<ConsentState[]> {
  const rows = await prisma.notificationConsent.findMany({
    where: { patientId, purpose },
    orderBy: { createdAt: 'desc' },
  });
  return CHANNELS.map((channel) => {
    const latest = rows.find((r) => r.channel === channel);
    return {
      channel,
      optedIn: latest?.optedIn ?? false,
      updatedAt: latest?.createdAt.toISOString() ?? null,
      source: latest?.source ?? null,
    };
  });
}

export async function hasConsent(patientId: string, channel: NotificationChannel, purpose = TRANSACTIONAL) {
  const latest = await prisma.notificationConsent.findFirst({
    where: { patientId, channel, purpose },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.optedIn ?? false;
}

export async function setConsent(input: {
  patientId: string;
  channel: NotificationChannel;
  optedIn: boolean;
  source: ConsentSource;
  actor: AuditActor | null;
  consentText?: string;
  purpose?: string;
}) {
  const purpose = input.purpose ?? TRANSACTIONAL;
  const current = await hasConsent(input.patientId, input.channel, purpose);
  const row = await prisma.notificationConsent.create({
    data: {
      patientId: input.patientId,
      channel: input.channel,
      purpose,
      optedIn: input.optedIn,
      source: input.source,
      recordedById: input.actor?.userId ?? null,
      consentText: input.consentText ?? null,
    },
  });
  await audit({
    actor: input.actor,
    action: input.optedIn ? 'consent.opt_in' : 'consent.opt_out',
    resourceType: 'NotificationConsent',
    resourceId: row.id,
    before: { channel: input.channel, optedIn: current },
    after: { channel: input.channel, optedIn: input.optedIn, source: input.source },
  });
  return row;
}

export async function consentHistory(patientId: string) {
  return prisma.notificationConsent.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, channel: true, purpose: true, optedIn: true, source: true, createdAt: true, consentText: true },
  });
}
