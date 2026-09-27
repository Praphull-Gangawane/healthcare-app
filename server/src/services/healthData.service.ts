import type { HealthProviderType, MeasurementFlag, ReadingValidation } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { providers } from '../providers/index.js';
import { HealthProviderError, type HeartRateReading } from '../providers/healthdata/types.js';
import { audit, type AuditActor } from './audit.service.js';
import { flagMeasurement, flagGuidance, recordVitals } from './vital.service.js';

const MAX_AGE_DAYS = 30;
const HR_MIN = 20;
const HR_MAX = 250;

export interface ReadingCheck {
  validation: ReadingValidation;
  message: string | null;
}

/** Validation never upgrades an estimate: camera/PPG demo values stay WELLNESS_ESTIMATE. */
export function validateReading(r: { bpm: number; measuredAt: Date }, providerType: HealthProviderType, now = new Date()): ReadingCheck {
  if (!Number.isFinite(r.bpm) || r.bpm < HR_MIN || r.bpm > HR_MAX) {
    return { validation: 'INVALID', message: `Reading of ${r.bpm} bpm is outside the plausible range and was not accepted as a measurement.` };
  }
  if (Number.isNaN(r.measuredAt.getTime()) || r.measuredAt.getTime() > now.getTime() + 5 * 60_000) {
    return { validation: 'INVALID', message: 'Reading timestamp is in the future.' };
  }
  if (r.measuredAt.getTime() < now.getTime() - MAX_AGE_DAYS * 86_400_000) {
    return { validation: 'INVALID', message: `Reading is older than ${MAX_AGE_DAYS} days.` };
  }
  if (providerType === 'CAMERA_PPG_DEMO') {
    return { validation: 'WELLNESS_ESTIMATE', message: 'DEMO / WELLNESS ESTIMATE — not a clinically validated measurement.' };
  }
  return { validation: 'VALID', message: null };
}

export async function listSources(patientId: string) {
  return prisma.healthDataSource.findMany({ where: { patientId }, orderBy: { createdAt: 'asc' } });
}

/** Explicit, per-provider permission. Nothing is read before permission is GRANTED. */
export async function connectSource(patientId: string, providerType: HealthProviderType, actor: AuditActor, opts: { scenario?: string | undefined; deviceName?: string | undefined; clientReportedStatus?: 'GRANTED' | 'DENIED' | undefined }) {
  const provider = providers.health[providerType];
  const result =
    provider.pullSupported || !opts.clientReportedStatus
      ? await provider.requestPermission({ patientId, scenario: opts.scenario })
      : { status: opts.clientReportedStatus, scopes: opts.clientReportedStatus === 'GRANTED' ? ['heart_rate.read'] : [] };
  const source = await prisma.healthDataSource.upsert({
    where: { patientId_providerType: { patientId, providerType } },
    update: {
      permissionStatus: result.status,
      scopes: result.scopes,
      permissionGrantedAt: result.status === 'GRANTED' ? new Date() : null,
      revokedAt: null,
      deviceName: opts.deviceName ?? undefined,
    },
    create: {
      patientId,
      providerType,
      permissionStatus: result.status,
      scopes: result.scopes,
      permissionGrantedAt: result.status === 'GRANTED' ? new Date() : null,
      deviceName: opts.deviceName ?? (providerType === 'MOCK' ? 'Mock Wearable' : null),
    },
  });
  await audit({ actor, action: result.status === 'GRANTED' ? 'healthdata.permission_granted' : 'healthdata.permission_denied', resourceType: 'HealthDataSource', resourceId: source.id, after: { providerType } });
  return source;
}

export async function revokeSource(patientId: string, providerType: HealthProviderType, actor: AuditActor) {
  const source = await prisma.healthDataSource.findUnique({ where: { patientId_providerType: { patientId, providerType } } });
  if (!source) throw notFound('Health data source');
  const updated = await prisma.healthDataSource.update({ where: { id: source.id }, data: { permissionStatus: 'REVOKED', revokedAt: new Date(), scopes: [] } });
  await audit({ actor, action: 'healthdata.permission_revoked', resourceType: 'HealthDataSource', resourceId: source.id });
  return updated;
}

async function storeReadings(patientId: string, sourceId: string, providerType: HealthProviderType, readings: HeartRateReading[]) {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { organizationId: true, dateOfBirth: true } });
  const out = [];
  for (const r of readings) {
    const check = validateReading(r, providerType);
    const flag: MeasurementFlag = check.validation === 'VALID' ? await flagMeasurement(patient, 'HEART_RATE', r.bpm, null, r.context ?? 'RESTING') : 'NOT_EVALUATED';
    try {
      const row = await prisma.healthDataReading.create({
        data: {
          patientId,
          sourceId,
          metric: 'HEART_RATE',
          value: Number.isFinite(r.bpm) ? Math.min(Math.max(r.bpm, 0), 999999) : 0,
          unit: 'bpm',
          measuredAt: Number.isNaN(r.measuredAt.getTime()) ? new Date() : r.measuredAt,
          context: r.context ?? null,
          accuracyMeta: (r.accuracy ?? undefined) as Prisma.InputJsonValue | undefined,
          validation: check.validation,
          validationMessage: check.message,
          isClinicallyValidated: false,
          flag,
          externalId: r.externalId,
        },
      });
      out.push({ ...row, guidance: await flagGuidance(patient.organizationId, flag) });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // already ingested
      throw err;
    }
  }
  await prisma.healthDataSource.update({ where: { id: sourceId }, data: { lastSyncAt: new Date() } });
  return out;
}

async function grantedSource(patientId: string, providerType: HealthProviderType) {
  const source = await prisma.healthDataSource.findUnique({ where: { patientId_providerType: { patientId, providerType } } });
  if (!source || source.permissionStatus !== 'GRANTED') {
    throw new AppError('HEALTH_PERMISSION_DENIED', 'Permission to read health data from this source has not been granted.');
  }
  return source;
}

/** Pull-based sync (mock wearable / vendor cloud APIs). */
export async function syncHeartRate(patientId: string, providerType: HealthProviderType, actor: AuditActor, scenario?: string) {
  const provider = providers.health[providerType];
  const source = await grantedSource(patientId, providerType);
  if (!provider.pullSupported) throw new AppError('HEALTH_DEVICE_UNAVAILABLE', 'This source sends readings from your device app. Open the app to sync.');
  let readings: HeartRateReading[];
  try {
    readings = await provider.getHeartRate({ patientId, scenario }, source.lastSyncAt ?? new Date(Date.now() - 3_600_000));
  } catch (err) {
    if (err instanceof HealthProviderError && err.kind === 'DEVICE_UNAVAILABLE') {
      throw new AppError('HEALTH_DEVICE_UNAVAILABLE', 'The health device is not available. Check that it is connected and try again.');
    }
    throw new AppError('PROVIDER_UNAVAILABLE', 'The health data service is temporarily unavailable. Please try again later.');
  }
  const stored = await storeReadings(patientId, source.id, providerType, readings);
  await audit({ actor, action: 'healthdata.sync', resourceType: 'HealthDataSource', resourceId: source.id, after: { received: readings.length, stored: stored.length } });
  return stored;
}

/** Push-based ingest from client apps (HealthKit, Health Connect, BLE, camera demo). */
export async function ingestHeartRate(patientId: string, providerType: HealthProviderType, readings: { bpm: number; measuredAt: string; externalId: string; context?: string | undefined; deviceName?: string | undefined }[], actor: AuditActor) {
  const source = await grantedSource(patientId, providerType);
  const stored = await storeReadings(
    patientId,
    source.id,
    providerType,
    readings.map((r) => ({ externalId: r.externalId, bpm: r.bpm, measuredAt: new Date(r.measuredAt), context: r.context, deviceName: r.deviceName })),
  );
  await audit({ actor, action: 'healthdata.ingest', resourceType: 'HealthDataSource', resourceId: source.id, after: { received: readings.length, providerType } });
  return stored;
}

export async function listReadings(patientId: string, limit = 50) {
  return prisma.healthDataReading.findMany({
    where: { patientId },
    orderBy: { measuredAt: 'desc' },
    take: limit,
    include: { source: { select: { providerType: true, deviceName: true } } },
  });
}

/**
 * Clinician review: copy a VALID device reading into the vitals record (source DEVICE / HEALTH_PLATFORM).
 * Wellness estimates and invalid readings can never be promoted.
 */
export async function promoteToVital(readingId: string, encounterId: string | undefined, actor: AuditActor) {
  const reading = await prisma.healthDataReading.findUnique({ where: { id: readingId }, include: { source: true } });
  if (!reading) throw notFound('Reading');
  if (reading.validation !== 'VALID') {
    throw new AppError('UNPROCESSABLE', 'Only validated device readings can be added to the clinical record. Wellness estimates cannot.');
  }
  if (reading.promotedVitalId) throw new AppError('CONFLICT', 'This reading was already added to the record.');
  const source = ['APPLE_HEALTHKIT', 'ANDROID_HEALTH_CONNECT'].includes(reading.source.providerType) ? 'HEALTH_PLATFORM' : 'DEVICE';
  const [vital] = await recordVitals(
    {
      patientId: reading.patientId,
      encounterId,
      source,
      context: reading.context ?? undefined,
      deviceName: reading.source.deviceName ?? reading.source.providerType,
      healthReadingId: reading.id,
      measurements: [{ type: 'HEART_RATE', value: Number(reading.value), unit: 'bpm', measuredAt: reading.measuredAt.toISOString() }],
    },
    actor,
  );
  await prisma.healthDataReading.update({ where: { id: reading.id }, data: { promotedVitalId: vital?.id ?? null } });
  return vital;
}
