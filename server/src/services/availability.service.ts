import type { AppointmentType } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { dateOnly, dayOfWeek, fromMinutes, localDate, toMinutes, zonedToUtc, addDays } from '../lib/time.js';
import { getOrgSettings } from './orgSettings.js';

export type SlotStatus = 'AVAILABLE' | 'FULL' | 'PAST' | 'BLOCKED';

export interface Slot {
  startAt: string;
  endAt: string;
  localTime: string;
  status: SlotStatus;
  capacity: number;
  booked: number;
  scheduleId: string;
  facilityId: string;
  departmentId: string;
  roomId: string | null;
}

interface Break {
  start: string;
  end: string;
}

/** Statuses that occupy a slot seat. HELD counts only while the hold is unexpired. */
export const ACTIVE_STATUSES = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'NO_SHOW'] as const;

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export interface AvailabilityQuery {
  doctorId: string;
  date: string;
  facilityId?: string | undefined;
  type?: AppointmentType | undefined;
  now?: Date;
}

/**
 * Computes bookable slots for a doctor on a local calendar date from recurring schedules, breaks,
 * facility holidays, doctor leave/blocks, per-slot capacity (1 + overbook) and existing bookings.
 * This is advisory for the UI; the booking transaction + partial unique index are authoritative.
 */
export async function getAvailability(q: AvailabilityQuery): Promise<{ date: string; slots: Slot[] }> {
  const now = q.now ?? new Date();
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: q.doctorId, isActive: true }, select: { id: true, user: { select: { organizationId: true } } } });
  if (!doctor) throw notFound('Doctor');
  const settings = doctor.user.organizationId ? await getOrgSettings(doctor.user.organizationId) : null;
  const day = dateOnly(q.date);
  const schedules = await prisma.doctorSchedule.findMany({
    where: {
      doctorId: q.doctorId,
      isActive: true,
      dayOfWeek: dayOfWeek(q.date),
      validFrom: { lte: day },
      OR: [{ validTo: null }, { validTo: { gte: day } }],
      ...(q.facilityId ? { facilityId: q.facilityId } : {}),
    },
    include: { facility: { select: { timezone: true, holidays: { where: { date: day } } } } },
    orderBy: { startTime: 'asc' },
  });

  const relevant = schedules.filter(
    (s) => s.facility.holidays.length === 0 && (!q.type || s.consultationTypes.length === 0 || s.consultationTypes.includes(q.type)),
  );
  if (relevant.length === 0) return { date: q.date, slots: [] };

  const tz = relevant[0]?.facility.timezone ?? 'Asia/Kolkata';
  const dayStart = zonedToUtc(q.date, '00:00', tz);
  const dayEnd = zonedToUtc(addDays(q.date, 1), '00:00', tz);
  const horizonEnd = new Date(now.getTime() + (settings?.bookingHorizonDays ?? 60) * 86_400_000);
  const leadCutoff = new Date(now.getTime() + (settings?.minBookingLeadMinutes ?? 5) * 60_000);

  const [leaves, appts] = await Promise.all([
    prisma.doctorLeave.findMany({ where: { doctorId: q.doctorId, startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }),
    prisma.appointment.findMany({
      where: {
        doctorId: q.doctorId,
        isWalkIn: false,
        startAt: { gte: dayStart, lt: dayEnd },
        OR: [{ status: { in: [...ACTIVE_STATUSES] } }, { status: 'HELD', holdExpiresAt: { gt: now } }],
      },
      select: { startAt: true },
    }),
  ]);
  const bookedAt = new Map<number, number>();
  for (const a of appts) bookedAt.set(a.startAt.getTime(), (bookedAt.get(a.startAt.getTime()) ?? 0) + 1);

  const slots: Slot[] = [];
  for (const s of relevant) {
    const breaks = (Array.isArray(s.breaks) ? (s.breaks as unknown as Break[]) : []).map((b) => [toMinutes(b.start), toMinutes(b.end)] as const);
    const capacity = 1 + s.overbookPerSlot;
    const step = s.slotMinutes + s.bufferMinutes;
    let sessionBooked = 0;
    const sessionSlots: Slot[] = [];
    for (let m = toMinutes(s.startTime); m + s.slotMinutes <= toMinutes(s.endTime); m += step) {
      if (breaks.some(([bs, be]) => overlaps(m, m + s.slotMinutes, bs, be))) continue;
      const start = zonedToUtc(q.date, fromMinutes(m), tz);
      const end = new Date(start.getTime() + s.slotMinutes * 60_000);
      const booked = bookedAt.get(start.getTime()) ?? 0;
      sessionBooked += booked;
      const blocked = leaves.some((l) => overlaps(start.getTime(), end.getTime(), l.startAt.getTime(), l.endAt.getTime()));
      let status: SlotStatus = 'AVAILABLE';
      if (blocked) status = 'BLOCKED';
      else if (start < leadCutoff || start > horizonEnd) status = 'PAST';
      else if (booked >= capacity) status = 'FULL';
      sessionSlots.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        localTime: fromMinutes(m),
        status,
        capacity,
        booked,
        scheduleId: s.id,
        facilityId: s.facilityId,
        departmentId: s.departmentId,
        roomId: s.roomId,
      });
    }
    if (s.maxAppointments !== null && sessionBooked >= s.maxAppointments) {
      for (const slot of sessionSlots) if (slot.status === 'AVAILABLE') slot.status = 'FULL';
    }
    slots.push(...sessionSlots);
  }
  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { date: q.date, slots };
}

/** Finds the schedule slot matching an exact start instant (used by booking validation). */
export async function findSlot(doctorId: string, startAt: Date, type?: AppointmentType, facilityId?: string) {
  const facility = facilityId ? await prisma.facility.findUnique({ where: { id: facilityId }, select: { timezone: true } }) : null;
  const tz = facility?.timezone ?? 'Asia/Kolkata';
  const { slots } = await getAvailability({ doctorId, date: localDate(startAt, tz), type, facilityId });
  return slots.find((s) => s.startAt === startAt.toISOString()) ?? null;
}
