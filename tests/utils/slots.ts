/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import type { ApiClient, ApiResponse } from './api.js';
import { addDays, randInt, todayIST } from './dates.js';

export interface Slot {
  startAt: string;
  endAt: string;
  localTime: string;
  status: 'AVAILABLE' | 'FULL' | 'PAST' | 'BLOCKED';
  capacity: number;
  booked: number;
  facilityId: string;
  departmentId: string;
}

export async function availability(client: ApiClient, doctorId: string, date: string): Promise<Slot[]> {
  const res = await client.get(`/api/directory/doctors/${doctorId}/availability`, { params: { date } });
  expect(res.status, res.text.slice(0, 300)).toBe(200);
  return res.body.data.slots as Slot[];
}

export async function slotAt(client: ApiClient, doctorId: string, startAt: string, date: string): Promise<Slot | undefined> {
  return (await availability(client, doctorId, date)).find((s) => s.startAt === new Date(startAt).toISOString());
}

/**
 * Picks a random AVAILABLE slot for the doctor. Randomising over many days × ~287 slots/day (the
 * test doctor is bookable around the clock) keeps parallel workers from colliding; callers still
 * retry on 409 (see bookWithRetry).
 */
export async function findAvailableSlot(client: ApiClient, doctorId: string, opts: { sameDay?: boolean; minDays?: number; maxDays?: number; minLeadMinutes?: number; maxLeadMinutes?: number; earliest?: boolean; exclude?: Set<string> } = {}): Promise<Slot | null> {
  const today = todayIST();
  const lead = (opts.minLeadMinutes ?? 10) * 60_000;
  const tried = new Set<string>();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const date = opts.sameDay ? today : addDays(today, randInt(opts.minDays ?? 2, opts.maxDays ?? 50));
    if (tried.has(date) && !opts.sameDay) continue;
    tried.add(date);
    const slots = (await availability(client, doctorId, date)).filter(
      (s) =>
        s.status === 'AVAILABLE' &&
        new Date(s.startAt).getTime() > Date.now() + lead &&
        (opts.maxLeadMinutes === undefined || new Date(s.startAt).getTime() <= Date.now() + opts.maxLeadMinutes * 60_000) &&
        !opts.exclude?.has(s.startAt),
    );
    if (slots.length) {
      if (opts.earliest) return slots[0] as Slot;
      const idx = (randInt(0, slots.length - 1) + test.info().workerIndex * 7) % slots.length;
      return slots[idx] as Slot;
    }
    if (opts.sameDay) return null;
  }
  return null;
}

/** Runs `attempt(slot)` on fresh random slots until it doesn't fail with 409 SLOT_UNAVAILABLE. */
export async function bookWithRetry(client: ApiClient, doctorId: string, attempt: (slot: Slot) => Promise<ApiResponse>, opts: Parameters<typeof findAvailableSlot>[2] = {}) {
  const exclude = new Set<string>(opts.exclude ?? []);
  for (let i = 0; i < 6; i += 1) {
    const slot = await findAvailableSlot(client, doctorId, { ...opts, exclude });
    if (!slot) break;
    const res = await attempt(slot);
    if (res.status === 409 && ['SLOT_UNAVAILABLE', 'CONFLICT'].includes(res.body?.error?.code)) {
      exclude.add(slot.startAt);
      continue;
    }
    return { res, slot };
  }
  throw new Error(`Could not find a bookable slot for doctor ${doctorId}`);
}

/** Books a CONFIRMED appointment (one-step) and returns it. */
export async function bookAppointment(client: ApiClient, input: { doctorId: string; patientId: string; type?: string; reason?: string }, opts: Parameters<typeof findAvailableSlot>[2] = {}) {
  const { res, slot } = await bookWithRetry(client, input.doctorId, (s) =>
    client.post('/api/appointments', { doctorId: input.doctorId, patientId: input.patientId, startAt: s.startAt, type: input.type ?? 'IN_PERSON', reason: input.reason }),
  opts);
  expect(res.status, res.text.slice(0, 400)).toBe(201);
  return { appointment: res.body.data as any, slot };
}
