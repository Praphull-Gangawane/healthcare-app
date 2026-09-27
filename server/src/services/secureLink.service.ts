import type { SecureLinkPurpose } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/crypto.js';

/**
 * Secure links for SMS/WhatsApp. The token is random (not guessable, not an id), stored only as a
 * hash, expires, and has limited uses. It only deep-links into the portal: resolving it still
 * requires the patient (or authorised proxy) to be signed in.
 */
export async function createSecureLink(input: {
  purpose: SecureLinkPurpose;
  resourceType: string;
  resourceId: string;
  patientId: string;
}): Promise<string> {
  const token = randomToken(24);
  await prisma.secureLink.create({
    data: {
      tokenHash: sha256(token),
      purpose: input.purpose,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      patientId: input.patientId,
      expiresAt: new Date(Date.now() + config.SECURE_LINK_TTL_HOURS * 3_600_000),
    },
  });
  return `${config.APP_BASE_URL}/s/${token}`;
}

export async function consumeSecureLink(token: string, allowedPatientIds: string[]) {
  const link = await prisma.secureLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!link) throw new AppError('NOT_FOUND', 'This link is not valid.');
  if (link.expiresAt < new Date() || link.useCount >= link.maxUses) {
    throw new AppError('LINK_EXPIRED', 'This link has expired. Please sign in to your patient portal to view your records.');
  }
  if (!allowedPatientIds.includes(link.patientId)) {
    throw new AppError('FORBIDDEN', 'This link belongs to a different patient account.');
  }
  await prisma.secureLink.update({ where: { id: link.id }, data: { useCount: { increment: 1 } } });
  return { purpose: link.purpose, resourceType: link.resourceType, resourceId: link.resourceId, patientId: link.patientId };
}
