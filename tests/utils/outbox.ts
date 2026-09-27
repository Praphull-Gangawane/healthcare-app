/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from '@playwright/test';
import type { ApiClient } from './api.js';

export interface OutboxEntry {
  providerMessageId: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  to: string;
  templateKey: string;
  purpose: string;
  text: string;
  params: string[];
  sentAt: string;
}

/** Mock-provider outbox for one recipient (the outbox is shared by all workers: always filter by recipient). */
export async function outboxFor(client: ApiClient, to: string, channel?: string): Promise<OutboxEntry[]> {
  const res = await client.get('/api/test/outbox', { params: { to, ...(channel ? { channel } : {}) } });
  expect(res.status).toBe(200);
  return res.body.data as OutboxEntry[];
}

export async function waitForOutbox(client: ApiClient, to: string, templateKey: string, channel = 'SMS'): Promise<OutboxEntry> {
  let found: OutboxEntry | undefined;
  await expect
    .poll(async () => {
      found = (await outboxFor(client, to, channel)).find((e) => e.templateKey === templateKey);
      return !!found;
    }, { message: `${templateKey} to ${to} via ${channel}`, timeout: 10_000 })
    .toBe(true);
  return found as OutboxEntry;
}

/** Notification delivery log rows for a patient (staff view). */
export async function notificationsFor(staff: ApiClient, patientId: string): Promise<any[]> {
  const res = await staff.get('/api/notifications', { params: { patientId, pageSize: 100 } });
  expect(res.status, res.text.slice(0, 300)).toBe(200);
  return res.body.data;
}
