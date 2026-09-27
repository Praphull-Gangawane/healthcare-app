import type { AppointmentType, FacilityType, Gender, LeaveType, VitalType } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { dateOnly } from '../lib/time.js';
import type { RoleKey } from '../config/rbac.js';
import { audit } from './audit.service.js';
import { hashPassword } from './auth/passwords.js';
import { assertFacilityScope, staffOrg } from './access/patientAccess.js';
import { invalidateOrgSettings, getOrgSettings, type OrgSettings } from './orgSettings.js';
import type { Principal } from './auth/principal.js';

// ─── Organization / facilities ───
export async function listFacilities(organizationId?: string) {
  return prisma.facility.findMany({
    where: { isActive: true, ...(organizationId ? { organizationId } : {}) },
    include: { address: true, departments: { where: { isActive: true }, orderBy: { name: 'asc' } }, rooms: { where: { isActive: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function listDepartments(facilityId?: string) {
  return prisma.department.findMany({
    where: { isActive: true, ...(facilityId ? { facilityId } : {}) },
    include: { facility: { select: { id: true, name: true } }, _count: { select: { doctorLinks: true } } },
    orderBy: [{ name: 'asc' }],
  });
}

export async function createFacility(p: Principal, input: { name: string; code: string; type: FacilityType; phone?: string | undefined; email?: string | undefined; registrationNo?: string | undefined; address?: { line1: string; city: string; state: string; postalCode?: string | undefined } | undefined }) {
  const org = staffOrg(p);
  const address = input.address ? await prisma.address.create({ data: { ...input.address, postalCode: input.address.postalCode ?? null } }) : null;
  const f = await prisma.facility.create({ data: { organizationId: org, name: input.name, code: input.code, type: input.type, phone: input.phone ?? null, email: input.email ?? null, registrationNo: input.registrationNo ?? null, addressId: address?.id ?? null } });
  await audit({ actor: p, action: 'facility.create', resourceType: 'Facility', resourceId: f.id, after: { code: f.code } });
  return f;
}

export async function createDepartment(p: Principal, input: { facilityId: string; name: string; code: string; description?: string | undefined }) {
  assertFacilityScope(p, input.facilityId);
  const f = await prisma.facility.findUnique({ where: { id: input.facilityId } });
  if (!f || f.organizationId !== staffOrg(p)) throw notFound('Facility');
  const d = await prisma.department.create({ data: { facilityId: input.facilityId, name: input.name, code: input.code, description: input.description ?? null } });
  await audit({ actor: p, action: 'department.create', resourceType: 'Department', resourceId: d.id, after: { code: d.code } });
  return d;
}

export async function createRoom(p: Principal, input: { facilityId: string; departmentId?: string | undefined; name: string; code: string }) {
  assertFacilityScope(p, input.facilityId);
  const r = await prisma.consultationRoom.create({ data: { facilityId: input.facilityId, departmentId: input.departmentId ?? null, name: input.name, code: input.code } });
  await audit({ actor: p, action: 'room.create', resourceType: 'ConsultationRoom', resourceId: r.id });
  return r;
}

export async function addHoliday(p: Principal, input: { facilityId: string; date: string; name: string }) {
  assertFacilityScope(p, input.facilityId);
  const h = await prisma.facilityHoliday.create({ data: { facilityId: input.facilityId, date: dateOnly(input.date), name: input.name } });
  await audit({ actor: p, action: 'holiday.create', resourceType: 'FacilityHoliday', resourceId: h.id });
  return h;
}

// ─── Users & roles ───
export async function listUsers(p: Principal, q: { role?: string | undefined }) {
  return prisma.user.findMany({
    where: { organizationId: staffOrg(p), ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}) },
    select: { id: true, email: true, displayName: true, status: true, lastLoginAt: true, createdAt: true, roles: { select: { id: true, facilityId: true, role: { select: { key: true, name: true } } } } },
    orderBy: { displayName: 'asc' },
  });
}

export async function createStaffUser(p: Principal, input: { email: string; displayName: string; phone?: string | undefined; password: string; roles: { role: RoleKey; facilityId?: string | undefined }[] }) {
  const org = staffOrg(p);
  if (input.roles.some((r) => r.role === 'SUPER_ADMIN') && !p.roles.includes('SUPER_ADMIN')) throw new AppError('FORBIDDEN', 'Only a super administrator can grant that role.');
  if (input.roles.some((r) => r.role === 'PATIENT')) throw new AppError('VALIDATION_ERROR', 'Patient accounts are created through registration.');
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
  const roles = await prisma.role.findMany({ where: { key: { in: input.roles.map((r) => r.role) } } });
  const user = await prisma.user.create({
    data: {
      organizationId: org,
      email: input.email,
      displayName: input.displayName,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      roles: { create: input.roles.map((r) => ({ roleId: roles.find((x) => x.key === r.role)?.id as string, facilityId: r.facilityId ?? null, grantedBy: p.userId })) },
    },
  });
  await audit({ actor: p, action: 'user.create', resourceType: 'User', resourceId: user.id, after: { roles: input.roles } });
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function grantRole(p: Principal, userId: string, input: { role: RoleKey; facilityId?: string | undefined }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.organizationId !== staffOrg(p)) throw notFound('User');
  if (input.role === 'SUPER_ADMIN' && !p.roles.includes('SUPER_ADMIN')) throw new AppError('FORBIDDEN', 'Only a super administrator can grant that role.');
  const role = await prisma.role.findUnique({ where: { key: input.role } });
  if (!role) throw notFound('Role');
  const ur = await prisma.userRole.create({ data: { userId, roleId: role.id, facilityId: input.facilityId ?? null, grantedBy: p.userId } });
  await audit({ actor: p, action: 'role.grant', resourceType: 'User', resourceId: userId, after: { role: input.role, facilityId: input.facilityId ?? null } });
  return ur;
}

export async function revokeRole(p: Principal, userId: string, userRoleId: string) {
  const ur = await prisma.userRole.findUnique({ where: { id: userRoleId }, include: { user: true, role: true } });
  if (!ur || ur.userId !== userId || ur.user.organizationId !== staffOrg(p)) throw notFound('Role grant');
  if (userId === p.userId) throw new AppError('UNPROCESSABLE', 'You cannot remove your own role.');
  await prisma.userRole.delete({ where: { id: userRoleId } });
  await audit({ actor: p, action: 'role.revoke', resourceType: 'User', resourceId: userId, before: { role: ur.role.key, facilityId: ur.facilityId } });
}

export async function setUserStatus(p: Principal, userId: string, status: 'ACTIVE' | 'DISABLED') {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.organizationId !== staffOrg(p)) throw notFound('User');
  await prisma.user.update({ where: { id: userId }, data: { status, ...(status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}) } });
  if (status === 'DISABLED') await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actor: p, action: `user.${status.toLowerCase()}`, resourceType: 'User', resourceId: userId, before: { status: user.status }, after: { status } });
}

export const listRoles = () => prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { key: 'asc' } });

// ─── Doctors & schedules ───
export async function createDoctor(
  p: Principal,
  input: {
    email: string; password: string; displayName: string; qualifications: string; specialty: string; experienceYears: number;
    registrationNumber?: string | undefined; registrationCouncil?: string | undefined; bio?: string | undefined; languages: string[]; gender?: Gender | undefined;
    consultationFee: string; teleconsultationFee?: string | undefined; consultationTypes: AppointmentType[];
    departments: { departmentId: string; facilityId: string }[];
  },
) {
  const user = await createStaffUser(p, { email: input.email, displayName: input.displayName, password: input.password, roles: input.departments.map((d) => ({ role: 'DOCTOR' as const, facilityId: d.facilityId })) });
  const doctor = await prisma.doctorProfile.create({
    data: {
      userId: user.id,
      displayName: input.displayName,
      qualifications: input.qualifications,
      specialty: input.specialty,
      experienceYears: input.experienceYears,
      registrationNumber: input.registrationNumber ?? null,
      registrationCouncil: input.registrationCouncil ?? null,
      bio: input.bio ?? null,
      languages: input.languages,
      gender: input.gender ?? null,
      consultationFee: input.consultationFee,
      teleconsultationFee: input.teleconsultationFee ?? null,
      consultationTypes: input.consultationTypes,
      departments: { create: input.departments },
    },
  });
  await audit({ actor: p, action: 'doctor.create', resourceType: 'DoctorProfile', resourceId: doctor.id });
  return doctor;
}

export async function updateDoctor(p: Principal, doctorId: string, patch: Partial<{ displayName: string; qualifications: string; specialty: string; experienceYears: number; bio: string; languages: string[]; consultationFee: string; teleconsultationFee: string; consultationTypes: AppointmentType[]; isActive: boolean }>) {
  const d = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!d || d.user.organizationId !== staffOrg(p)) throw notFound('Doctor');
  const updated = await prisma.doctorProfile.update({ where: { id: doctorId }, data: patch });
  await audit({ actor: p, action: 'doctor.update', resourceType: 'DoctorProfile', resourceId: doctorId, after: { fields: Object.keys(patch) } });
  return updated;
}

async function assertDoctorInOrg(p: Principal, doctorId: string) {
  const d = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!d || d.user.organizationId !== staffOrg(p)) throw notFound('Doctor');
  return d;
}

export async function listSchedules(p: Principal, doctorId: string) {
  await assertDoctorInOrg(p, doctorId);
  const [schedules, leaves] = await Promise.all([
    prisma.doctorSchedule.findMany({ where: { doctorId }, include: { facility: { select: { name: true } }, department: { select: { name: true } }, room: { select: { name: true } } }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
    prisma.doctorLeave.findMany({ where: { doctorId, endAt: { gte: new Date() } }, orderBy: { startAt: 'asc' } }),
  ]);
  return { schedules, leaves };
}

export async function createSchedule(p: Principal, doctorId: string, input: { facilityId: string; departmentId: string; roomId?: string | undefined; dayOfWeek: number; startTime: string; endTime: string; breaks: { start: string; end: string }[]; slotMinutes: number; bufferMinutes: number; maxAppointments?: number | undefined; overbookPerSlot: number; consultationTypes: AppointmentType[]; validFrom: string; validTo?: string | undefined }) {
  await assertDoctorInOrg(p, doctorId);
  assertFacilityScope(p, input.facilityId);
  if (input.startTime >= input.endTime) throw new AppError('VALIDATION_ERROR', 'End time must be after start time.');
  const overlapping = await prisma.doctorSchedule.findFirst({ where: { doctorId, dayOfWeek: input.dayOfWeek, isActive: true, startTime: { lt: input.endTime }, endTime: { gt: input.startTime } } });
  if (overlapping) throw new AppError('CONFLICT', 'This schedule overlaps an existing session for the doctor.');
  const s = await prisma.doctorSchedule.create({
    data: { ...input, doctorId, roomId: input.roomId ?? null, maxAppointments: input.maxAppointments ?? null, validFrom: dateOnly(input.validFrom), validTo: input.validTo ? dateOnly(input.validTo) : null },
  });
  await audit({ actor: p, action: 'schedule.create', resourceType: 'DoctorSchedule', resourceId: s.id, after: { dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime } });
  return s;
}

export async function deactivateSchedule(p: Principal, scheduleId: string) {
  const s = await prisma.doctorSchedule.findUnique({ where: { id: scheduleId } });
  if (!s) throw notFound('Schedule');
  await assertDoctorInOrg(p, s.doctorId);
  await prisma.doctorSchedule.update({ where: { id: scheduleId }, data: { isActive: false } });
  await audit({ actor: p, action: 'schedule.deactivate', resourceType: 'DoctorSchedule', resourceId: scheduleId });
}

export async function addLeave(p: Principal, doctorId: string, input: { type: LeaveType; startAt: string; endAt: string; reason?: string | undefined }) {
  await assertDoctorInOrg(p, doctorId);
  const l = await prisma.doctorLeave.create({ data: { doctorId, type: input.type, startAt: new Date(input.startAt), endAt: new Date(input.endAt), reason: input.reason ?? null } });
  const affected = await prisma.appointment.count({ where: { doctorId, startAt: { gte: l.startAt, lt: l.endAt }, status: { in: ['BOOKED', 'CONFIRMED'] } } });
  await audit({ actor: p, action: 'leave.create', resourceType: 'DoctorLeave', resourceId: l.id, after: { affectedAppointments: affected } });
  return { ...l, affectedAppointments: affected };
}

// ─── Reference ranges / settings ───
export const listReferenceRanges = (p: Principal) => prisma.vitalReferenceRange.findMany({ where: { organizationId: staffOrg(p) }, orderBy: [{ type: 'asc' }, { ageMinYears: 'asc' }] });

export async function upsertReferenceRange(p: Principal, input: { id?: string | undefined; type: VitalType; context?: string | undefined; ageMinYears: number; ageMaxYears: number; low: number; high: number; urgentLow?: number | undefined; urgentHigh?: number | undefined; low2?: number | undefined; high2?: number | undefined; unit: string }) {
  const org = staffOrg(p);
  if (input.low >= input.high) throw new AppError('VALIDATION_ERROR', 'Low threshold must be below the high threshold.');
  const data = { organizationId: org, type: input.type, context: input.context ?? null, ageMinYears: input.ageMinYears, ageMaxYears: input.ageMaxYears, low: input.low, high: input.high, urgentLow: input.urgentLow ?? null, urgentHigh: input.urgentHigh ?? null, low2: input.low2 ?? null, high2: input.high2 ?? null, unit: input.unit, updatedById: p.userId };
  let row;
  if (input.id) {
    const before = await prisma.vitalReferenceRange.findUnique({ where: { id: input.id } });
    if (!before || before.organizationId !== org) throw notFound('Reference range');
    row = await prisma.vitalReferenceRange.update({ where: { id: input.id }, data });
    await audit({ actor: p, action: 'reference_range.update', resourceType: 'VitalReferenceRange', resourceId: row.id, before: { low: Number(before.low), high: Number(before.high) }, after: { low: input.low, high: input.high } });
  } else {
    row = await prisma.vitalReferenceRange.create({ data });
    await audit({ actor: p, action: 'reference_range.create', resourceType: 'VitalReferenceRange', resourceId: row.id });
  }
  return row;
}

export async function updateOrgSettings(p: Principal, patch: Partial<OrgSettings>) {
  const org = staffOrg(p);
  const current = await getOrgSettings(org);
  const next = { ...current, ...patch };
  await prisma.organization.update({ where: { id: org }, data: { settings: next } });
  invalidateOrgSettings(org);
  await audit({ actor: p, action: 'org.settings_update', resourceType: 'Organization', resourceId: org, after: { fields: Object.keys(patch) } });
  return next;
}

export const listRetention = (p: Principal) => prisma.retentionPolicy.findMany({ where: { organizationId: staffOrg(p) } });

export async function upsertRetention(p: Principal, input: { resourceType: string; retainYears: number; action: string; legalBasisNote?: string | undefined }) {
  const org = staffOrg(p);
  const row = await prisma.retentionPolicy.upsert({
    where: { organizationId_resourceType: { organizationId: org, resourceType: input.resourceType } },
    update: { retainYears: input.retainYears, action: input.action, legalBasisNote: input.legalBasisNote ?? null },
    create: { organizationId: org, resourceType: input.resourceType, retainYears: input.retainYears, action: input.action, legalBasisNote: input.legalBasisNote ?? null },
  });
  await audit({ actor: p, action: 'retention.update', resourceType: 'RetentionPolicy', resourceId: row.id, after: { resourceType: input.resourceType, retainYears: input.retainYears } });
  return row;
}
