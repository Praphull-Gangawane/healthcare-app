import crypto from 'node:crypto';
import type { Channel, NotificationMessage, NotificationProvider, NotificationResult } from './types.js';

export interface OutboxEntry {
  providerMessageId: string;
  channel: Channel;
  to: string;
  templateKey: string;
  purpose: string;
  text: string;
  params: string[];
  sentAt: string;
}

export type MockFailureMode = 'none' | 'retryable' | 'permanent';

const OUTBOX_LIMIT = 500;
const outbox: OutboxEntry[] = [];
const failureMode: Record<Channel, MockFailureMode> = { SMS: 'none', WHATSAPP: 'none', EMAIL: 'none' };

/**
 * Deterministic mock provider — never sends real messages. Recipients ending in `0000` fail with a
 * retryable error and recipients ending in `9999` fail permanently, so tests can exercise retries.
 * The in-memory outbox is exposed only through dev/test routes (ENABLE_TEST_ROUTES).
 */
export class MockNotificationProvider implements NotificationProvider {
  readonly name: string;
  constructor(readonly channel: Channel) {
    this.name = `mock-${channel.toLowerCase()}`;
  }

  send(message: NotificationMessage): Promise<NotificationResult> {
    const mode = failureMode[this.channel];
    if (mode === 'retryable' || message.to.endsWith('0000')) {
      return Promise.resolve({ status: 'FAILED', failureReason: 'MOCK_TEMPORARY_FAILURE', retryable: true });
    }
    if (mode === 'permanent' || message.to.endsWith('9999')) {
      return Promise.resolve({ status: 'FAILED', failureReason: 'MOCK_INVALID_RECIPIENT', retryable: false });
    }
    const providerMessageId = `mock_${this.channel.toLowerCase()}_${crypto.randomUUID()}`;
    outbox.unshift({
      providerMessageId,
      channel: this.channel,
      to: message.to,
      templateKey: message.templateKey,
      purpose: message.purpose,
      text: message.text,
      params: message.params,
      sentAt: new Date().toISOString(),
    });
    if (outbox.length > OUTBOX_LIMIT) outbox.length = OUTBOX_LIMIT;
    return Promise.resolve({ status: 'SENT', providerMessageId, retryable: false });
  }
}

export const mockOutbox = {
  list: (filter?: { to?: string; channel?: Channel }) =>
    outbox.filter((e) => (!filter?.to || e.to === filter.to) && (!filter?.channel || e.channel === filter.channel)),
  clear: () => {
    outbox.length = 0;
  },
  setFailureMode: (channel: Channel, mode: MockFailureMode) => {
    failureMode[channel] = mode;
  },
  resetFailureModes: () => {
    failureMode.SMS = 'none';
    failureMode.WHATSAPP = 'none';
    failureMode.EMAIL = 'none';
  },
};
