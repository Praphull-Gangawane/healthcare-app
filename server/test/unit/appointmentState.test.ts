import { describe, expect, it } from 'vitest';
import { APPOINTMENT_TRANSITIONS, canTransition, isActiveBooking, STATUS_TIMESTAMP } from '../../src/domain/appointmentState.js';

type Status = keyof typeof APPOINTMENT_TRANSITIONS;
const ALL = Object.keys(APPOINTMENT_TRANSITIONS) as Status[];

describe('appointment state machine', () => {
  it.each<[Status, Status]>([
    ['HELD', 'CONFIRMED'],
    ['HELD', 'CANCELLED'],
    ['BOOKED', 'CONFIRMED'],
    ['CONFIRMED', 'CHECKED_IN'],
    ['CONFIRMED', 'RESCHEDULED'],
    ['CONFIRMED', 'CANCELLED'],
    ['CONFIRMED', 'NO_SHOW'],
    ['CONFIRMED', 'IN_CONSULTATION'], // teleconsultation starts without a check-in
    ['CHECKED_IN', 'WAITING'],
    ['WAITING', 'IN_CONSULTATION'],
    ['WAITING', 'NO_SHOW'],
    ['IN_CONSULTATION', 'COMPLETED'],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[Status, Status]>([
    ['HELD', 'COMPLETED'],
    ['HELD', 'NO_SHOW'],
    ['CONFIRMED', 'COMPLETED'],
    ['CHECKED_IN', 'RESCHEDULED'],
    ['WAITING', 'CONFIRMED'],
    ['IN_CONSULTATION', 'CANCELLED'],
    ['IN_CONSULTATION', 'NO_SHOW'],
    ['AVAILABLE', 'CONFIRMED'],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it.each<Status>(['COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'])('%s is terminal', (s) => {
    for (const to of ALL) expect(canTransition(s, to)).toBe(false);
  });

  it('never allows a self-transition', () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });

  it('only references known statuses', () => {
    for (const targets of Object.values(APPOINTMENT_TRANSITIONS)) for (const t of targets) expect(ALL).toContain(t);
  });

  it('maps timestamps for entered statuses', () => {
    expect(STATUS_TIMESTAMP.CHECKED_IN).toBe('checkedInAt');
    expect(STATUS_TIMESTAMP.CANCELLED).toBe('cancelledAt');
    expect(STATUS_TIMESTAMP.NO_SHOW).toBe('noShowAt');
    expect(STATUS_TIMESTAMP.WAITING).toBeUndefined();
  });

  it('isActiveBooking is true only for BOOKED/CONFIRMED', () => {
    expect(ALL.filter(isActiveBooking).sort()).toEqual(['BOOKED', 'CONFIRMED']);
  });
});
