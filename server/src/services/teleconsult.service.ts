import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { providers } from '../providers/index.js';
import { audit } from './audit.service.js';
import { portalPatientIds } from './access/patientAccess.js';
import type { Principal } from './auth/principal.js';

const JOIN_EARLY_MINUTES = 15;
const JOIN_LATE_MINUTES = 60;

async function load(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { teleconsult: true } });
  if (!appt) throw notFound('Appointment');
  if (appt.type !== 'TELECONSULTATION') throw new AppError('UNPROCESSABLE', 'This is not a teleconsultation appointment.');
  return appt;
}

/**
 * Join flow: participants authenticate, are authorised against the appointment, and receive a
 * short-lived participant-bound token. There is no public meeting link. The patient records
 * consent to a teleconsultation on first join (Telemedicine Practice Guidelines — verify current rules).
 */
export async function join(p: Principal, appointmentId: string, input: { consent?: boolean | undefined }) {
  const appt = await load(appointmentId);
  const isDoctor = p.doctorId === appt.doctorId && p.permissions.has('teleconsult:host');
  const isPatient = !isDoctor && (await portalPatientIds(p, 'appointments')).includes(appt.patientId);
  if (!isDoctor && !isPatient) throw notFound('Appointment');
  if (!['CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION'].includes(appt.status)) throw new AppError('UNPROCESSABLE', 'This teleconsultation is not active.');
  const now = Date.now();
  if (now < appt.startAt.getTime() - JOIN_EARLY_MINUTES * 60_000 || now > appt.endAt.getTime() + JOIN_LATE_MINUTES * 60_000) {
    throw new AppError('UNPROCESSABLE', `You can join from ${JOIN_EARLY_MINUTES} minutes before the scheduled time.`);
  }
  let tele = appt.teleconsult;
  if (!tele) {
    const session = await providers.teleconsult.createSession({ appointmentId, scheduledStart: appt.startAt, scheduledEnd: appt.endAt });
    tele = await prisma.teleconsultation.create({ data: { appointmentId, provider: session.provider, sessionRef: session.sessionRef } });
  }
  if (tele.status === 'CONVERTED_TO_IN_PERSON' || tele.status === 'CANCELLED' || tele.status === 'ENDED') {
    throw new AppError('UNPROCESSABLE', 'This teleconsultation is no longer available.');
  }
  if (isPatient && !tele.patientConsentAt) {
    if (!input.consent) throw new AppError('CONSENT_REQUIRED', 'Please confirm that you consent to a video consultation.');
    tele = await prisma.teleconsultation.update({ where: { id: tele.id }, data: { patientConsentAt: new Date() } });
  }
  const token = await providers.teleconsult.issueJoinToken(tele.sessionRef, { userId: p.userId, role: isDoctor ? 'HOST' : 'PATIENT' });
  await prisma.teleconsultation.update({
    where: { id: tele.id },
    data: { status: 'ACTIVE', ...(isDoctor ? { doctorJoinedAt: new Date() } : { patientJoinedAt: new Date() }) },
  });
  await audit({ actor: p, action: 'teleconsult.join', resourceType: 'Teleconsultation', resourceId: tele.id, after: { role: isDoctor ? 'HOST' : 'PATIENT' } });
  return { provider: tele.provider, ...token, mock: tele.provider.startsWith('mock') };
}

/** The clinician may decide an in-person assessment is needed — software never forces a modality. */
export async function convertToInPerson(p: Principal, appointmentId: string, note: string) {
  const appt = await load(appointmentId);
  if (p.doctorId !== appt.doctorId) throw notFound('Appointment');
  const tele = appt.teleconsult
    ? await prisma.teleconsultation.update({ where: { id: appt.teleconsult.id }, data: { status: 'CONVERTED_TO_IN_PERSON', modalityNote: note, endedAt: new Date() } })
    : await prisma.teleconsultation.create({ data: { appointmentId, provider: providers.teleconsult.name, sessionRef: 'none', status: 'CONVERTED_TO_IN_PERSON', modalityNote: note } });
  await audit({ actor: p, action: 'teleconsult.convert_in_person', resourceType: 'Teleconsultation', resourceId: tele.id, reason: note });
  return tele;
}

export async function end(p: Principal, appointmentId: string) {
  const appt = await load(appointmentId);
  if (p.doctorId !== appt.doctorId || !appt.teleconsult) throw notFound('Teleconsultation');
  await providers.teleconsult.endSession(appt.teleconsult.sessionRef);
  const tele = await prisma.teleconsultation.update({ where: { id: appt.teleconsult.id }, data: { status: 'ENDED', endedAt: new Date() } });
  await audit({ actor: p, action: 'teleconsult.end', resourceType: 'Teleconsultation', resourceId: tele.id });
  return tele;
}
