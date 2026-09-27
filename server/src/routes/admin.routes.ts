import { Router } from 'express';
import { z } from 'zod';
import { ok, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { email, hhmm, id, isoDate, money } from '../validators/common.js';
import { passwordSchema } from '../services/auth/passwords.js';
import { ROLE_KEYS } from '../config/rbac.js';
import * as admin from '../services/admin.service.js';
import { staffOrg } from '../services/access/patientAccess.js';
import { getOrgSettings } from '../services/orgSettings.js';

export const adminRouter = Router();
adminRouter.use(authenticate);

const apptType = z.enum(['IN_PERSON', 'TELECONSULTATION', 'FOLLOW_UP', 'URGENT', 'DIAGNOSTIC', 'PROCEDURE']);
const roleKey = z.enum(ROLE_KEYS);

adminRouter.get('/facilities', requirePermission('facility:manage', 'report:operational'), async (req, res) => ok(res, await admin.listFacilities(staffOrg(requirePrincipal(req)))));
adminRouter.post('/facilities', requirePermission('facility:manage'), async (req, res) => {
  const body = parseBody(z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(20), type: z.enum(['CLINIC', 'MULTI_SPECIALTY_CLINIC', 'HOSPITAL', 'DIAGNOSTIC_CENTER']), phone: z.string().max(20).optional(), email: email.optional(), registrationNo: z.string().max(60).optional(), address: z.object({ line1: z.string().min(1).max(200), city: z.string().min(1).max(80), state: z.string().min(1).max(80), postalCode: z.string().max(10).optional() }).optional() }), req);
  ok(res, await admin.createFacility(requirePrincipal(req), body), 201);
});
adminRouter.post('/departments', requirePermission('facility:manage'), async (req, res) => {
  const body = parseBody(z.object({ facilityId: id, name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(20), description: z.string().max(500).optional() }), req);
  ok(res, await admin.createDepartment(requirePrincipal(req), body), 201);
});
adminRouter.post('/rooms', requirePermission('facility:manage'), async (req, res) => {
  const body = parseBody(z.object({ facilityId: id, departmentId: id.optional(), name: z.string().trim().min(1).max(60), code: z.string().trim().min(1).max(20) }), req);
  ok(res, await admin.createRoom(requirePrincipal(req), body), 201);
});
adminRouter.post('/holidays', requirePermission('facility:manage', 'schedule:manage'), async (req, res) => {
  const body = parseBody(z.object({ facilityId: id, date: isoDate, name: z.string().trim().min(2).max(100) }), req);
  ok(res, await admin.addHoliday(requirePrincipal(req), body), 201);
});

adminRouter.get('/users', requirePermission('user:manage'), async (req, res) => {
  const q = parseQuery(z.object({ role: roleKey.optional() }), req);
  ok(res, await admin.listUsers(requirePrincipal(req), q));
});
adminRouter.post('/users', requirePermission('user:manage'), async (req, res) => {
  const body = parseBody(z.object({ email, displayName: z.string().trim().min(2).max(120), phone: z.string().max(20).optional(), password: passwordSchema, roles: z.array(z.object({ role: roleKey, facilityId: id.optional() })).min(1).max(10) }), req);
  ok(res, await admin.createStaffUser(requirePrincipal(req), body), 201);
});
adminRouter.post('/users/:id/roles', requirePermission('user:manage', 'role:manage'), async (req, res) => {
  const body = parseBody(z.object({ role: roleKey, facilityId: id.optional() }), req);
  ok(res, await admin.grantRole(requirePrincipal(req), param(req, 'id'), body), 201);
});
adminRouter.delete('/users/:id/roles/:userRoleId', requirePermission('user:manage', 'role:manage'), async (req, res) => {
  await admin.revokeRole(requirePrincipal(req), param(req, 'id'), param(req, 'userRoleId'));
  ok(res, { revoked: true });
});
adminRouter.post('/users/:id/status', requirePermission('user:manage'), async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }), req);
  await admin.setUserStatus(requirePrincipal(req), param(req, 'id'), body.status);
  ok(res, { status: body.status });
});
adminRouter.get('/roles', requirePermission('user:manage', 'role:manage'), async (_req, res) => ok(res, await admin.listRoles()));

adminRouter.post('/doctors', requirePermission('doctor:manage'), async (req, res) => {
  const body = parseBody(
    z.object({
      email, password: passwordSchema, displayName: z.string().trim().min(2).max(120), qualifications: z.string().trim().min(2).max(200), specialty: z.string().trim().min(2).max(100),
      experienceYears: z.number().int().min(0).max(70), registrationNumber: z.string().max(60).optional(), registrationCouncil: z.string().max(120).optional(), bio: z.string().max(2000).optional(),
      languages: z.array(z.string().max(40)).max(10).default(['English']), gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).optional(), consultationFee: money, teleconsultationFee: money.optional(),
      consultationTypes: z.array(apptType).min(1), departments: z.array(z.object({ departmentId: id, facilityId: id })).min(1),
    }),
    req,
  );
  ok(res, await admin.createDoctor(requirePrincipal(req), body), 201);
});
adminRouter.patch('/doctors/:id', requirePermission('doctor:manage'), async (req, res) => {
  const body = parseBody(z.object({ displayName: z.string().min(2).max(120), qualifications: z.string().max(200), specialty: z.string().max(100), experienceYears: z.number().int().min(0).max(70), bio: z.string().max(2000), languages: z.array(z.string().max(40)).max(10), consultationFee: money, teleconsultationFee: money, consultationTypes: z.array(apptType).min(1), isActive: z.boolean() }).partial(), req);
  ok(res, await admin.updateDoctor(requirePrincipal(req), param(req, 'id'), body));
});
adminRouter.get('/doctors/:id/schedules', requirePermission('schedule:manage'), async (req, res) => ok(res, await admin.listSchedules(requirePrincipal(req), param(req, 'id'))));
adminRouter.post('/doctors/:id/schedules', requirePermission('schedule:manage'), async (req, res) => {
  const body = parseBody(
    z.object({
      facilityId: id, departmentId: id, roomId: id.optional(), dayOfWeek: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm,
      breaks: z.array(z.object({ start: hhmm, end: hhmm })).max(5).default([]), slotMinutes: z.number().int().min(5).max(240).default(15), bufferMinutes: z.number().int().min(0).max(60).default(0),
      maxAppointments: z.number().int().min(1).max(500).optional(), overbookPerSlot: z.number().int().min(0).max(5).default(0), consultationTypes: z.array(apptType).default([]), validFrom: isoDate, validTo: isoDate.optional(),
    }),
    req,
  );
  ok(res, await admin.createSchedule(requirePrincipal(req), param(req, 'id'), body), 201);
});
adminRouter.delete('/schedules/:scheduleId', requirePermission('schedule:manage'), async (req, res) => {
  await admin.deactivateSchedule(requirePrincipal(req), param(req, 'scheduleId'));
  ok(res, { deactivated: true });
});
adminRouter.post('/doctors/:id/leave', requirePermission('schedule:manage'), async (req, res) => {
  const body = parseBody(z.object({ type: z.enum(['LEAVE', 'HOLIDAY', 'SLOT_BLOCK']).default('LEAVE'), startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), reason: z.string().max(300).optional() }), req);
  ok(res, await admin.addLeave(requirePrincipal(req), param(req, 'id'), body), 201);
});

adminRouter.get('/reference-ranges', requirePermission('reference_range:manage', 'facility:manage'), async (req, res) => ok(res, await admin.listReferenceRanges(requirePrincipal(req))));
adminRouter.put('/reference-ranges', requirePermission('reference_range:manage'), async (req, res) => {
  const body = parseBody(z.object({ id: id.optional(), type: z.enum(['HEART_RATE', 'BLOOD_PRESSURE', 'RESPIRATORY_RATE', 'TEMPERATURE', 'OXYGEN_SATURATION', 'HEIGHT', 'WEIGHT', 'BMI']), context: z.string().max(40).optional(), ageMinYears: z.number().int().min(0).max(150), ageMaxYears: z.number().int().min(0).max(150), low: z.number(), high: z.number(), urgentLow: z.number().optional(), urgentHigh: z.number().optional(), low2: z.number().optional(), high2: z.number().optional(), unit: z.string().min(1).max(20) }), req);
  ok(res, await admin.upsertReferenceRange(requirePrincipal(req), body));
});

adminRouter.get('/settings', requirePermission('facility:manage'), async (req, res) => ok(res, await getOrgSettings(staffOrg(requirePrincipal(req)))));
adminRouter.patch('/settings', requirePermission('facility:manage'), async (req, res) => {
  const body = parseBody(z.object({ bookingHorizonDays: z.number().int().min(1).max(365), minBookingLeadMinutes: z.number().int().min(0).max(1440), holdMinutes: z.number().int().min(1).max(30), cancellationWindowHours: z.number().int().min(0).max(168), rescheduleWindowHours: z.number().int().min(0).max(168), reminderLeadHours: z.number().int().min(1).max(72), emergencyMessage: z.string().min(10).max(500), reviewMessage: z.string().min(10).max(500), prescriptionFooter: z.string().max(500), autoReleaseLabReports: z.boolean() }).partial(), req);
  ok(res, await admin.updateOrgSettings(requirePrincipal(req), body));
});

adminRouter.get('/retention', requirePermission('privacy:manage'), async (req, res) => ok(res, await admin.listRetention(requirePrincipal(req))));
adminRouter.put('/retention', requirePermission('privacy:manage'), async (req, res) => {
  const body = parseBody(z.object({ resourceType: z.string().min(2).max(60), retainYears: z.number().int().min(0).max(100), action: z.enum(['ARCHIVE', 'ANONYMIZE', 'REVIEW']), legalBasisNote: z.string().max(500).optional() }), req);
  ok(res, await admin.upsertRetention(requirePrincipal(req), body));
});
