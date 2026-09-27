import type { AppointmentStatus } from '../generated/prisma/enums.js';

/** Allowed appointment status transitions (pure domain rule, unit-tested). */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  AVAILABLE: [],
  HELD: ['CONFIRMED', 'BOOKED', 'CANCELLED'],
  BOOKED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'IN_CONSULTATION'],
  CHECKED_IN: ['WAITING', 'IN_CONSULTATION', 'CANCELLED', 'NO_SHOW'],
  WAITING: ['IN_CONSULTATION', 'CANCELLED', 'NO_SHOW'],
  IN_CONSULTATION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  RESCHEDULED: [],
  NO_SHOW: [],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) =>
  APPOINTMENT_TRANSITIONS[from].includes(to);

/** Timestamp column set when entering a status. */
export const STATUS_TIMESTAMP: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: 'confirmedAt',
  CHECKED_IN: 'checkedInAt',
  IN_CONSULTATION: 'consultationStartedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
  NO_SHOW: 'noShowAt',
};

export const isActiveBooking = (s: AppointmentStatus) => ['BOOKED', 'CONFIRMED'].includes(s);
