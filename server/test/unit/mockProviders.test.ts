import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockNotificationProvider, mockOutbox } from '../../src/providers/notification/mock.js';
import { MockPaymentProvider } from '../../src/providers/payment/mock.js';
import { ClientIngestHealthProvider, MockHealthDataProvider } from '../../src/providers/healthdata/mock.js';
import { HealthProviderError } from '../../src/providers/healthdata/types.js';
import { MockTeleconsultationProvider } from '../../src/providers/teleconsult/mock.js';
import { verifyPayload } from '../../src/lib/crypto.js';

const msg = (to: string) => ({ channel: 'SMS' as const, to, templateKey: 'APPOINTMENT_CONFIRMED', purpose: 'APPOINTMENT', text: 'hello', params: [], idempotencyKey: 'k1' });

describe('MockNotificationProvider', () => {
  const sms = new MockNotificationProvider('SMS');
  beforeEach(() => {
    mockOutbox.clear();
    mockOutbox.resetFailureModes();
  });

  it('sends and records to the outbox', async () => {
    const r = await sms.send(msg('+919876500001'));
    expect(r).toMatchObject({ status: 'SENT', retryable: false });
    expect(r.providerMessageId).toMatch(/^mock_sms_/);
    expect(mockOutbox.list({ to: '+919876500001' })).toHaveLength(1);
    expect(mockOutbox.list({ channel: 'EMAIL' })).toHaveLength(0);
  });

  it('fails retryably for recipients ending 0000 and permanently for 9999', async () => {
    expect(await sms.send(msg('+919876500000'))).toEqual({ status: 'FAILED', failureReason: 'MOCK_TEMPORARY_FAILURE', retryable: true });
    expect(await sms.send(msg('+919876509999'))).toEqual({ status: 'FAILED', failureReason: 'MOCK_INVALID_RECIPIENT', retryable: false });
    expect(mockOutbox.list()).toHaveLength(0);
  });

  it('honours per-channel failure modes', async () => {
    mockOutbox.setFailureMode('SMS', 'permanent');
    expect((await sms.send(msg('+919876500001'))).retryable).toBe(false);
    expect((await new MockNotificationProvider('EMAIL').send({ ...msg('a@example.test'), channel: 'EMAIL' })).status).toBe('SENT');
    mockOutbox.setFailureMode('SMS', 'retryable');
    expect((await sms.send(msg('+919876500001'))).retryable).toBe(true);
  });
});

describe('MockPaymentProvider', () => {
  const pay = new MockPaymentProvider();
  const input = (amount: string) => ({ amount, currency: 'INR', invoiceNumber: 'INV-1', method: 'UPI' as const, idempotencyKey: 'k' });
  it('declines amounts ending in .13 and approves others', async () => {
    expect(await pay.createPayment(input('500.13'))).toEqual({ status: 'FAILED', failureReason: 'MOCK_DECLINED' });
    expect(await pay.createPayment(input('0.13'))).toMatchObject({ status: 'FAILED' });
    const ok = await pay.createPayment(input('500.00'));
    expect(ok.status).toBe('PAID');
    expect(ok.providerRef).toMatch(/^mockpay_/);
    expect((await pay.createPayment(input('13.00'))).status).toBe('PAID');
  });
  it('refunds', async () => expect((await pay.refund('ref1')).ok).toBe(true));
});

describe('MockHealthDataProvider', () => {
  const hp = new MockHealthDataProvider();
  const fixed = new Date('2026-09-26T06:00:00Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
  });
  afterEach(() => vi.useRealTimers());

  it('grants unless scenario permission_denied', async () => {
    expect((await hp.requestPermission({ patientId: 'p' })).status).toBe('GRANTED');
    expect(await hp.requestPermission({ patientId: 'p', scenario: 'permission_denied' })).toMatchObject({ status: 'DENIED', scopes: [] });
  });

  it('is deterministic for the same inputs', async () => {
    const since = new Date(fixed.getTime() - 30 * 60_000);
    const a = await hp.getHeartRate({ patientId: 'p1' }, since);
    const b = await hp.getHeartRate({ patientId: 'p1' }, since);
    expect(a).toEqual(b);
    expect(a.map((r) => r.bpm)).toEqual([71, 72, 73]);
    expect(new Set(a.map((r) => r.externalId)).size).toBe(3);
    for (const r of a) expect(r.measuredAt.getTime()).toBeLessThanOrEqual(fixed.getTime());
  });

  it('supports failure and data scenarios', async () => {
    const since = new Date(fixed.getTime() - 3_600_000);
    await expect(hp.getHeartRate({ patientId: 'p', scenario: 'device_unavailable' }, since)).rejects.toMatchObject({ kind: 'DEVICE_UNAVAILABLE' });
    await expect(hp.getHeartRate({ patientId: 'p', scenario: 'provider_failure' }, since)).rejects.toBeInstanceOf(HealthProviderError);
    expect((await hp.getHeartRate({ patientId: 'p', scenario: 'invalid_reading' }, since)).map((r) => r.bpm)).toEqual([72, 0, 400]);
    expect((await hp.getHeartRate({ patientId: 'p', scenario: 'elevated' }, since)).map((r) => r.bpm)).toEqual([104, 108, 112]);
    const fut = await hp.getHeartRate({ patientId: 'p', scenario: 'future_timestamp' }, since);
    expect(fut[2]!.measuredAt.getTime()).toBeGreaterThan(fixed.getTime() + 3_600_000);
  });

  it('client-ingest providers never pull', async () => {
    const cam = new ClientIngestHealthProvider('CAMERA_PPG_DEMO', false);
    expect(cam.pullSupported).toBe(false);
    expect(cam.clinicalGrade).toBe(false);
    await expect(cam.getHeartRate()).rejects.toMatchObject({ kind: 'DEVICE_UNAVAILABLE' });
  });
});

describe('MockTeleconsultationProvider', () => {
  it('issues signed, participant-bound, short-lived tokens (no public link)', async () => {
    const tp = new MockTeleconsultationProvider();
    const s = await tp.createSession({ appointmentId: 'a1', scheduledStart: new Date(), scheduledEnd: new Date() });
    expect(s.sessionRef).toMatch(/^mockroom_a1_/);
    const t = await tp.issueJoinToken(s.sessionRef, { userId: 'u1', role: 'PATIENT' });
    expect(verifyPayload(t.token)).toMatchObject({ r: s.sessionRef, u: 'u1', role: 'PATIENT' });
    expect(t.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    expect(t.roomUrl.startsWith('http')).toBe(false);
  });
});
