import { Prisma, type NotificationChannel } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { providers } from '../../providers/index.js';
import { audit, type AuditActor } from '../audit.service.js';
import { hasConsent, CHANNELS } from './consent.service.js';
import { render, TEMPLATES, type TemplateKey } from './templates.js';

export interface NotifyInput {
  patientId: string;
  templateKey: TemplateKey;
  variables: Record<string, string>;
  /** Stable key for duplicate prevention, e.g. `APPOINTMENT_CONFIRMED:<appointmentId>`. */
  dedupeKey: string;
  channels?: NotificationChannel[];
  actor?: AuditActor | null;
}

export interface NotifyOutcome {
  channel: NotificationChannel;
  notificationId: string | null;
  status: string;
  duplicate?: boolean;
}

function recipientFor(channel: NotificationChannel, p: { mobile: string | null; email: string | null }) {
  return channel === 'EMAIL' ? p.email : p.mobile;
}

/**
 * Queue + dispatch a transactional notification on every consented channel. Messaging logic is
 * kept here (never in controllers). Duplicate sends are prevented by a unique dedupe key.
 */
export async function notify(input: NotifyInput): Promise<NotifyOutcome[]> {
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: { id: true, mobile: true, email: true, isActive: true },
  });
  if (!patient) return [];
  const outcomes: NotifyOutcome[] = [];
  const def = TEMPLATES[input.templateKey];

  for (const channel of input.channels ?? CHANNELS) {
    const recipient = recipientFor(channel, patient);
    const consented = await hasConsent(patient.id, channel);
    const status = !recipient ? 'SKIPPED_NO_CONTACT' : !consented ? 'SKIPPED_NO_CONSENT' : 'QUEUED';
    try {
      const n = await prisma.notification.create({
        data: {
          patientId: patient.id,
          channel,
          templateKey: input.templateKey,
          purpose: def.purpose,
          status,
          dedupeKey: `${input.dedupeKey}:${channel}`,
          recipient: recipient ?? null,
          variables: input.variables,
          nextAttemptAt: status === 'QUEUED' ? new Date() : null,
        },
      });
      if (status === 'QUEUED') {
        const final = await dispatch(n.id);
        outcomes.push({ channel, notificationId: n.id, status: final });
      } else {
        outcomes.push({ channel, notificationId: n.id, status });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        outcomes.push({ channel, notificationId: null, status: 'DUPLICATE_SUPPRESSED', duplicate: true });
        continue;
      }
      logger.error({ err, channel, templateKey: input.templateKey }, 'notification enqueue failed');
      outcomes.push({ channel, notificationId: null, status: 'ERROR' });
    }
  }

  await audit({
    actor: input.actor ?? null,
    action: 'notification.send',
    resourceType: 'Patient',
    resourceId: patient.id,
    after: { templateKey: input.templateKey, outcomes: outcomes.map((o) => `${o.channel}:${o.status}`) },
  });
  return outcomes;
}

/** Sends one queued notification attempt, records a delivery-log row, schedules retries. */
export async function dispatch(notificationId: string): Promise<string> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status !== 'QUEUED' || !n.recipient) return n?.status ?? 'MISSING';

  // Re-check consent at send time: an opt-out between enqueue and retry must be honoured.
  if (n.patientId && !(await hasConsent(n.patientId, n.channel))) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED_NO_CONSENT', nextAttemptAt: null } });
    return 'SKIPPED_NO_CONSENT';
  }

  const templateKey = n.templateKey as TemplateKey;
  const vars = (n.variables ?? {}) as Record<string, string>;
  const rendered = render(templateKey, vars);
  const provider = providers.notification[n.channel];
  const attempt = n.attempts + 1;

  const result = await provider
    .send({
      channel: n.channel,
      to: n.recipient,
      templateKey,
      purpose: n.purpose,
      text: rendered.text,
      subject: rendered.subject,
      params: rendered.params,
      providerTemplateId: n.channel === 'WHATSAPP' ? rendered.def.whatsappTemplate : rendered.def.dltTemplateId,
      idempotencyKey: `${n.id}:${attempt}`,
    })
    .catch(() => ({ status: 'FAILED' as const, failureReason: 'PROVIDER_EXCEPTION', retryable: true, providerMessageId: undefined }));

  const now = new Date();
  const exhausted = attempt >= config.NOTIFICATION_MAX_ATTEMPTS;
  const finalStatus = result.status === 'SENT' ? 'SENT' : result.retryable && !exhausted ? 'QUEUED' : 'FAILED';

  await prisma.$transaction([
    prisma.notificationDeliveryLog.create({
      data: {
        notificationId: n.id,
        patientId: n.patientId,
        channel: n.channel,
        templateKey: n.templateKey,
        purpose: n.purpose,
        provider: provider.name,
        providerMessageId: result.providerMessageId ?? null,
        status: result.status === 'SENT' ? 'SENT' : 'FAILED',
        attempt,
        sentAt: result.status === 'SENT' ? now : null,
        failedAt: result.status === 'SENT' ? null : now,
        failureReason: result.failureReason ?? null,
      },
    }),
    prisma.notification.update({
      where: { id: n.id },
      data: {
        attempts: attempt,
        status: finalStatus,
        lastError: result.failureReason ?? null,
        nextAttemptAt:
          finalStatus === 'QUEUED'
            ? new Date(now.getTime() + config.NOTIFICATION_RETRY_BASE_SECONDS * 1000 * 2 ** (attempt - 1))
            : null,
      },
    }),
  ]);
  if (result.status !== 'SENT') {
    logger.warn({ notificationId: n.id, channel: n.channel, attempt, reason: result.failureReason }, 'notification attempt failed');
  }
  return finalStatus;
}

/** Retry worker body: dispatch all queued notifications whose retry time has come. */
export async function processDue(limit = 50): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const d of due) await dispatch(d.id);
  return due.length;
}

/** Manual retry by staff: re-queue a FAILED notification for one more attempt. */
export async function retry(notificationId: string, actor: AuditActor) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status !== 'FAILED') return n?.status ?? 'MISSING';
  await prisma.notification.update({
    where: { id: n.id },
    data: { status: 'QUEUED', nextAttemptAt: new Date(), attempts: Math.min(n.attempts, config.NOTIFICATION_MAX_ATTEMPTS - 1) },
  });
  await audit({ actor, action: 'notification.retry', resourceType: 'Notification', resourceId: n.id });
  return dispatch(n.id);
}

/** Delivery receipts from provider webhooks (or the mock simulator). */
export async function recordReceipt(providerMessageId: string, status: 'DELIVERED' | 'READ' | 'FAILED', reason?: string) {
  const log = await prisma.notificationDeliveryLog.findFirst({ where: { providerMessageId } });
  if (!log) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.notificationDeliveryLog.update({
      where: { id: log.id },
      data: {
        status,
        ...(status === 'DELIVERED' ? { deliveredAt: now } : {}),
        ...(status === 'READ' ? { readAt: now, deliveredAt: log.deliveredAt ?? now } : {}),
        ...(status === 'FAILED' ? { failedAt: now, failureReason: reason ?? 'PROVIDER_REPORTED_FAILURE' } : {}),
      },
    }),
    prisma.notification.update({ where: { id: log.notificationId }, data: { status } }),
  ]);
  return true;
}

let timer: NodeJS.Timeout | null = null;
export function startNotificationWorker() {
  if (timer || config.NOTIFICATION_WORKER_INTERVAL_MS === 0) return;
  timer = setInterval(() => {
    processDue().catch((err: unknown) => logger.error({ err }, 'notification worker failed'));
  }, config.NOTIFICATION_WORKER_INTERVAL_MS);
  timer.unref();
}
export function stopNotificationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
