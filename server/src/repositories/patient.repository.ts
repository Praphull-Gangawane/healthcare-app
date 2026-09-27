import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { dateOnly } from '../lib/time.js';

export const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Demographic projection — the least-privilege default for patient lists. */
export const demographicSelect = {
  id: true,
  uhid: true,
  firstName: true,
  lastName: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
  mobile: true,
  email: true,
  bloodGroup: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;

export interface DuplicateProbe {
  organizationId: string;
  fullName: string;
  dateOfBirth: string;
  mobile?: string | undefined;
  email?: string | undefined;
}

/** Reliable matching: same DOB plus same mobile, same normalized name, or same email. */
export function findDuplicateCandidates(probe: DuplicateProbe, db: Tx | typeof prisma = prisma) {
  const dob = dateOnly(probe.dateOfBirth);
  const or: Prisma.PatientWhereInput[] = [{ nameNormalized: normalizeName(probe.fullName) }];
  if (probe.mobile) or.push({ mobile: probe.mobile });
  if (probe.email) or.push({ email: probe.email });
  return db.patient.findMany({
    where: { organizationId: probe.organizationId, dateOfBirth: dob, isActive: true, OR: or },
    select: { id: true, uhid: true, fullName: true, dateOfBirth: true, mobile: true },
    take: 5,
  });
}

export interface PatientSearch {
  organizationId: string;
  q?: string | undefined;
  uhid?: string | undefined;
  mobile?: string | undefined;
  dateOfBirth?: string | undefined;
  email?: string | undefined;
  appointmentNumber?: string | undefined;
  skip: number;
  take: number;
}

export async function searchPatients(s: PatientSearch) {
  const and: Prisma.PatientWhereInput[] = [{ organizationId: s.organizationId }];
  if (s.uhid) and.push({ uhid: s.uhid.toUpperCase() });
  if (s.mobile) and.push({ mobile: { contains: s.mobile.replace(/\D/g, '').slice(-10) } });
  if (s.dateOfBirth) and.push({ dateOfBirth: dateOnly(s.dateOfBirth) });
  if (s.email) and.push({ email: s.email.toLowerCase() });
  if (s.appointmentNumber) and.push({ appointments: { some: { appointmentNumber: s.appointmentNumber.toUpperCase() } } });
  if (s.q) {
    const q = s.q.trim();
    const digits = q.replace(/\D/g, '');
    const name = normalizeName(q);
    // Identifier-shaped queries (UHID / appointment number) must not fall back to fuzzy matching.
    const looksLikeId = /^[a-z]{2,5}-\d/i.test(q);
    and.push({
      OR: [
        // An empty normalized name (e.g. a numeric query) must not match every patient.
        ...(name.length >= 2 && !looksLikeId ? [{ nameNormalized: { contains: name } }] : []),
        { uhid: { equals: q.toUpperCase() } },
        ...(digits.length >= 4 && !looksLikeId ? [{ mobile: { contains: digits } }] : []),
        { email: { equals: q.toLowerCase() } },
        { appointments: { some: { appointmentNumber: q.toUpperCase() } } },
      ],
    });
  }
  const where: Prisma.PatientWhereInput = { AND: and };
  const [items, total] = await Promise.all([
    prisma.patient.findMany({ where, select: demographicSelect, orderBy: { fullName: 'asc' }, skip: s.skip, take: s.take }),
    prisma.patient.count({ where }),
  ]);
  return { items, total };
}
