import { Router } from 'express';
import { z } from 'zod';
import { ok, pageMeta, param, parseQuery } from '../lib/http.js';
import { isoDate, pagination, toPage } from '../validators/common.js';
import * as doctors from '../services/doctor.service.js';
import { getAvailability } from '../services/availability.service.js';
import { listDepartments, listFacilities } from '../services/admin.service.js';

/** Public directory (no authentication): facilities, departments, doctors, availability. */
export const directoryRouter = Router();

const appointmentType = z.enum(['IN_PERSON', 'TELECONSULTATION', 'FOLLOW_UP', 'URGENT', 'DIAGNOSTIC', 'PROCEDURE']);

directoryRouter.get('/facilities', async (_req, res) => {
  const rows = await listFacilities();
  ok(res, rows.map((f) => ({ id: f.id, name: f.name, code: f.code, type: f.type, phone: f.phone, address: f.address, departments: f.departments.map((d) => ({ id: d.id, name: d.name, code: d.code })) })));
});

directoryRouter.get('/departments', async (req, res) => {
  const q = parseQuery(z.object({ facilityId: z.string().optional() }), req);
  const rows = await listDepartments(q.facilityId);
  ok(res, rows.map((d) => ({ id: d.id, name: d.name, code: d.code, description: d.description, facility: d.facility, doctorCount: d._count.doctorLinks })));
});

directoryRouter.get('/specialties', async (_req, res) => ok(res, await doctors.listSpecialties()));

directoryRouter.get('/doctors', async (req, res) => {
  const q = parseQuery(
    pagination.extend({
      q: z.string().trim().max(100).optional(),
      specialty: z.string().trim().max(100).optional(),
      departmentId: z.string().max(64).optional(),
      facilityId: z.string().max(64).optional(),
      language: z.string().trim().max(40).optional(),
      consultationType: appointmentType.optional(),
      withNextSlot: z.enum(['true', 'false']).optional(),
    }),
    req,
  );
  const page = toPage(q);
  const { items, total } = await doctors.searchDoctors({ ...q, ...page });
  const withSlots =
    q.withNextSlot === 'true'
      ? await Promise.all(items.map(async (d) => ({ ...d, nextAvailableSlot: await doctors.nextAvailableSlot(d.id, undefined, 7) })))
      : items;
  ok(res, withSlots, 200, pageMeta(page, total));
});

directoryRouter.get('/doctors/:id', async (req, res) => {
  const d = await doctors.getDoctor(param(req, 'id'));
  ok(res, { ...d, nextAvailableSlot: await doctors.nextAvailableSlot(d.id) });
});

directoryRouter.get('/doctors/:id/availability', async (req, res) => {
  const q = parseQuery(z.object({ date: isoDate, facilityId: z.string().optional(), type: appointmentType.optional() }), req);
  ok(res, await getAvailability({ doctorId: param(req, 'id'), date: q.date, facilityId: q.facilityId, type: q.type }));
});
