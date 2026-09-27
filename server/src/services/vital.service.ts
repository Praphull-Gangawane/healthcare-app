import type { MeasurementSource, Prisma, VitalType } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { ageInYears } from '../lib/time.js';
import { computeBmi, evaluateAgainstRange, validateVital, type Flag, type VitalInput } from '../domain/vitalRules.js';
import { audit, type AuditActor } from './audit.service.js';
import { getOrgSettings } from './orgSettings.js';

export async function findRange(organizationId: string, type: VitalType, ageYears: number, context?: string | null) {
  const ranges = await prisma.vitalReferenceRange.findMany({
    where: { organizationId, type, ageMinYears: { lte: ageYears }, ageMaxYears: { gte: ageYears } },
  });
  const pick = ranges.find((r) => r.context && context && r.context === context) ?? ranges.find((r) => !r.context) ?? null;
  return pick
    ? { low: Number(pick.low), high: Number(pick.high), urgentLow: pick.urgentLow ? Number(pick.urgentLow) : null, urgentHigh: pick.urgentHigh ? Number(pick.urgentHigh) : null, low2: pick.low2 ? Number(pick.low2) : null, high2: pick.high2 ? Number(pick.high2) : null }
    : null;
}

export async function flagMeasurement(patient: { organizationId: string; dateOfBirth: Date }, type: VitalType, value: number, value2: number | null, context?: string | null): Promise<Flag> {
  const rule = await findRange(patient.organizationId, type, ageInYears(patient.dateOfBirth), context);
  return evaluateAgainstRange(value, value2, rule);
}

/** Patient/clinician-facing guidance for a flag — safe wording, no diagnosis. */
export async function flagGuidance(organizationId: string, flag: Flag) {
  const s = await getOrgSettings(organizationId);
  if (flag === 'REQUIRES_REVIEW') return { message: s.reviewMessage };
  if (flag === 'URGENT_REVIEW') return { message: s.reviewMessage, emergencyMessage: s.emergencyMessage };
  return {};
}

export interface RecordVitalsInput {
  patientId: string;
  encounterId?: string | undefined;
  source?: MeasurementSource;
  context?: string | undefined;
  deviceName?: string | undefined;
  healthReadingId?: string | undefined;
  measurements: VitalInput[];
}

export async function recordVitals(input: RecordVitalsInput, actor: AuditActor, db?: Tx) {
  const errors: { index: number; code: string; message: string }[] = [];
  const valid = input.measurements.map((m, index) => {
    const r = validateVital(m);
    if (!r.ok) errors.push({ index, code: r.code, message: r.message });
    return r.ok ? r.vital : null;
  });
  if (errors.length) throw new AppError('VALIDATION_ERROR', errors[0]?.message ?? 'Invalid vital sign.', errors);

  const vitals = valid.filter((v): v is NonNullable<typeof v> => v !== null);
  const height = vitals.find((v) => v.type === 'HEIGHT');
  const weight = vitals.find((v) => v.type === 'WEIGHT');
  if (height && weight && !vitals.some((v) => v.type === 'BMI')) {
    vitals.push({ type: 'BMI', value: computeBmi(height.value, weight.value), value2: null, unit: 'kg/m²', measuredAt: weight.measuredAt });
  }

  const run = async (tx: Tx) => {
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, select: { organizationId: true, dateOfBirth: true } });
    if (input.encounterId) {
      const enc = await tx.encounter.findUnique({ where: { id: input.encounterId }, select: { patientId: true, status: true } });
      if (!enc || enc.patientId !== input.patientId) throw notFound('Encounter');
    }
    const created = [];
    for (const v of vitals) {
      const flag = await flagMeasurement(patient, v.type, v.value, v.value2, input.context);
      const row = await tx.vital.create({
        data: {
          patientId: input.patientId,
          encounterId: input.encounterId ?? null,
          type: v.type,
          value: v.value,
          value2: v.value2,
          unit: v.unit,
          measuredAt: v.measuredAt,
          source: input.source ?? 'MANUAL',
          context: input.context ?? null,
          deviceName: input.deviceName ?? null,
          healthReadingId: input.healthReadingId ?? null,
          flag,
          recordedById: actor.userId,
        },
      });
      created.push({ ...row, guidance: await flagGuidance(patient.organizationId, flag) });
    }
    await audit({ actor, action: 'vital.record', resourceType: 'Patient', resourceId: input.patientId, after: { types: vitals.map((v) => v.type), encounterId: input.encounterId ?? null } }, tx);
    return created;
  };
  return db ? run(db) : prisma.$transaction(run);
}

/** Corrections never overwrite: the original is marked CORRECTED and linked to the new row. */
export async function correctVital(vitalId: string, input: { value: number; value2?: number | undefined; unit: string; reason: string }, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.vital.findUnique({ where: { id: vitalId } });
    if (!original) throw notFound('Vital');
    if (original.status !== 'ACTIVE') throw new AppError('INVALID_STATE_TRANSITION', 'Only the current value can be corrected.');
    const check = validateVital({ type: original.type, value: input.value, value2: input.value2, unit: input.unit, measuredAt: original.measuredAt.toISOString() });
    if (!check.ok) throw new AppError('VALIDATION_ERROR', check.message);
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: original.patientId }, select: { organizationId: true, dateOfBirth: true } });
    await tx.vital.update({ where: { id: original.id }, data: { status: 'CORRECTED' } });
    const corrected = await tx.vital.create({
      data: {
        patientId: original.patientId,
        encounterId: original.encounterId,
        type: original.type,
        value: check.vital.value,
        value2: check.vital.value2,
        unit: check.vital.unit,
        measuredAt: original.measuredAt,
        source: original.source,
        context: original.context,
        deviceName: original.deviceName,
        flag: await flagMeasurement(patient, original.type, check.vital.value, check.vital.value2, original.context),
        correctsId: original.id,
        correctionReason: input.reason,
        recordedById: actor.userId,
      },
    });
    await audit(
      { actor, action: 'vital.correct', resourceType: 'Vital', resourceId: original.id, reason: input.reason, before: { value: Number(original.value), value2: original.value2 ? Number(original.value2) : null, unit: original.unit }, after: { value: check.vital.value, value2: check.vital.value2, unit: check.vital.unit, newId: corrected.id } },
      tx,
    );
    return corrected;
  });
}

export async function listVitals(patientId: string, q: { type?: VitalType | undefined; includeHistory?: boolean | undefined; limit: number }) {
  const where: Prisma.VitalWhereInput = { patientId, ...(q.type ? { type: q.type } : {}), ...(q.includeHistory ? {} : { status: 'ACTIVE' }) };
  return prisma.vital.findMany({ where, orderBy: { measuredAt: 'desc' }, take: q.limit, include: { corrects: { select: { id: true, value: true, value2: true, unit: true } } } });
}

export async function vitalTrend(patientId: string, type: VitalType, limit = 50) {
  const rows = await prisma.vital.findMany({ where: { patientId, type, status: 'ACTIVE' }, orderBy: { measuredAt: 'asc' }, take: limit });
  return rows.map((r) => ({ measuredAt: r.measuredAt, value: Number(r.value), value2: r.value2 ? Number(r.value2) : null, unit: r.unit, flag: r.flag, source: r.source }));
}
