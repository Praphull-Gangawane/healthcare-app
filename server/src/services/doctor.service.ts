import type { AppointmentType, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { addDays, localDate } from '../lib/time.js';
import { getAvailability } from './availability.service.js';

export interface DoctorSearch {
  q?: string | undefined;
  specialty?: string | undefined;
  departmentId?: string | undefined;
  facilityId?: string | undefined;
  language?: string | undefined;
  consultationType?: AppointmentType | undefined;
  skip: number;
  take: number;
}

export const publicDoctorSelect = {
  id: true,
  displayName: true,
  qualifications: true,
  specialty: true,
  experienceYears: true,
  registrationNumber: true,
  registrationCouncil: true,
  bio: true,
  languages: true,
  gender: true,
  consultationFee: true,
  teleconsultationFee: true,
  consultationTypes: true,
  photoUrl: true,
  departments: {
    select: {
      department: { select: { id: true, name: true, code: true } },
      facility: { select: { id: true, name: true, code: true, type: true, address: { select: { city: true, state: true, line1: true } } } },
    },
  },
} satisfies Prisma.DoctorProfileSelect;

export async function searchDoctors(s: DoctorSearch) {
  const where: Prisma.DoctorProfileWhereInput = {
    isActive: true,
    ...(s.q
      ? { OR: [{ displayName: { contains: s.q, mode: 'insensitive' } }, { specialty: { contains: s.q, mode: 'insensitive' } }] }
      : {}),
    ...(s.specialty ? { specialty: { equals: s.specialty, mode: 'insensitive' } } : {}),
    ...(s.language ? { languages: { has: s.language } } : {}),
    ...(s.consultationType ? { consultationTypes: { has: s.consultationType } } : {}),
    ...(s.departmentId || s.facilityId
      ? { departments: { some: { ...(s.departmentId ? { departmentId: s.departmentId } : {}), ...(s.facilityId ? { facilityId: s.facilityId } : {}) } } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.doctorProfile.findMany({ where, select: publicDoctorSelect, orderBy: { displayName: 'asc' }, skip: s.skip, take: s.take }),
    prisma.doctorProfile.count({ where }),
  ]);
  return { items, total };
}

export async function getDoctor(doctorId: string) {
  const d = await prisma.doctorProfile.findFirst({ where: { id: doctorId, isActive: true }, select: publicDoctorSelect });
  if (!d) throw notFound('Doctor');
  return d;
}

/** Scans forward day by day (bounded) to find the next open slot. */
export async function nextAvailableSlot(doctorId: string, fromDate?: string, maxDays = 14) {
  const tz = 'Asia/Kolkata';
  let date = fromDate ?? localDate(new Date(), tz);
  for (let i = 0; i < maxDays; i += 1) {
    const { slots } = await getAvailability({ doctorId, date });
    const open = slots.find((s) => s.status === 'AVAILABLE');
    if (open) return open;
    date = addDays(date, 1);
  }
  return null;
}

export async function listSpecialties() {
  const rows = await prisma.doctorProfile.findMany({ where: { isActive: true }, distinct: ['specialty'], select: { specialty: true }, orderBy: { specialty: 'asc' } });
  return rows.map((r) => r.specialty);
}
