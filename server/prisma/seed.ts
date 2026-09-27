/**
 * Deterministic demo seed — ALL DATA IS FICTIONAL. No real patients, no real doctor identities.
 * Registration numbers use the obviously fake "DEMO-" prefix. Demo passwords are for local
 * development only and can be overridden with SEED_DEMO_PASSWORD.
 */
import { prisma } from '../src/lib/prisma.js';
import { PERMISSIONS, ROLE_GRANTS, type RoleKey } from '../src/config/rbac.js';
import { hashPassword } from '../src/services/auth/passwords.js';
import { loadPrincipal } from '../src/services/auth/principal.js';
import { nextNumber, nextUhid } from '../src/lib/ids.js';
import { addDays, dateOnly, dayOfWeek, localDate, zonedToUtc } from '../src/lib/time.js';
import { normalizeName } from '../src/repositories/patient.repository.js';
import { flagMeasurement } from '../src/services/vital.service.js';
import * as rx from '../src/services/prescription.service.js';
import * as inv from '../src/services/investigation.service.js';
import * as billing from '../src/services/billing.service.js';
import { DEFAULT_SETTINGS } from '../src/services/orgSettings.js';
import type { AppointmentStatus, AppointmentType, Gender } from '../src/generated/prisma/client.js';

const TZ = 'Asia/Kolkata';
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo@12345';
const log = (msg: string) => process.stdout.write(`[seed] ${msg}\n`);

// Deterministic PRNG (mulberry32)
let state = 20260926;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

async function reset() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

async function seedRbac() {
  await prisma.permission.createMany({ data: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })) });
  const perms = await prisma.permission.findMany();
  for (const [key, def] of Object.entries(ROLE_GRANTS)) {
    const role = await prisma.role.create({ data: { key, name: def.name, isSystem: true } });
    await prisma.rolePermission.createMany({ data: def.permissions.map((pk) => ({ roleId: role.id, permissionId: perms.find((p) => p.key === pk)!.id })) });
  }
  return Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id])) as Record<RoleKey, string>;
}

const FACILITIES = [
  { code: 'RSC', name: 'Riverside Demo Clinic', type: 'MULTI_SPECIALTY_CLINIC' as const, city: 'Pune', state: 'Maharashtra', line1: '12 Demo River Road, Aundh', postal: '411007', phone: '+912000000101' },
  { code: 'LVH', name: 'Lakeview Demo Hospital', type: 'HOSPITAL' as const, city: 'Mumbai', state: 'Maharashtra', line1: '45 Sample Lake Marg, Powai', postal: '400076', phone: '+912200000202' },
  { code: 'HCD', name: 'Hillcrest Demo Diagnostics', type: 'DIAGNOSTIC_CENTER' as const, city: 'Bengaluru', state: 'Karnataka', line1: '8 Example Hill Street, Indiranagar', postal: '560038', phone: '+918000000303' },
];

const DEPARTMENTS = [
  { code: 'GM', name: 'General Medicine', facility: 'RSC', specialty: 'General Physician' },
  { code: 'PED', name: 'Paediatrics', facility: 'RSC', specialty: 'Paediatrician' },
  { code: 'DERM', name: 'Dermatology', facility: 'RSC', specialty: 'Dermatologist' },
  { code: 'CARD', name: 'Cardiology', facility: 'LVH', specialty: 'Cardiologist' },
  { code: 'ORTH', name: 'Orthopaedics', facility: 'LVH', specialty: 'Orthopaedic Surgeon' },
  { code: 'ENT', name: 'ENT', facility: 'LVH', specialty: 'ENT Specialist' },
  { code: 'OBG', name: 'Obstetrics & Gynaecology', facility: 'LVH', specialty: 'Gynaecologist' },
  { code: 'PATH', name: 'Pathology & Imaging', facility: 'HCD', specialty: 'Pathologist' },
];

const DOCTORS: { first: string; last: string; gender: Gender; dept: string; quals: string; exp: number; langs: string[] }[] = [
  { first: 'Asha', last: 'Varkey', gender: 'FEMALE', dept: 'GM', quals: 'MBBS, MD (General Medicine)', exp: 14, langs: ['English', 'Hindi', 'Malayalam'] },
  { first: 'Rohan', last: 'Deshmane', gender: 'MALE', dept: 'GM', quals: 'MBBS, DNB (Family Medicine)', exp: 9, langs: ['English', 'Marathi', 'Hindi'] },
  { first: 'Meera', last: 'Kulkarny', gender: 'FEMALE', dept: 'PED', quals: 'MBBS, MD (Paediatrics)', exp: 11, langs: ['English', 'Marathi'] },
  { first: 'Farhan', last: 'Qadiri', gender: 'MALE', dept: 'PED', quals: 'MBBS, DCH', exp: 7, langs: ['English', 'Hindi', 'Urdu'] },
  { first: 'Ishita', last: 'Bhandarkar', gender: 'FEMALE', dept: 'DERM', quals: 'MBBS, MD (Dermatology)', exp: 8, langs: ['English', 'Hindi'] },
  { first: 'Vikram', last: 'Sethuram', gender: 'MALE', dept: 'CARD', quals: 'MBBS, MD, DM (Cardiology)', exp: 18, langs: ['English', 'Tamil', 'Hindi'] },
  { first: 'Nandini', last: 'Rao-Pillai', gender: 'FEMALE', dept: 'CARD', quals: 'MBBS, DNB (Cardiology)', exp: 12, langs: ['English', 'Kannada'] },
  { first: 'Arjun', last: 'Malhoutra', gender: 'MALE', dept: 'ORTH', quals: 'MBBS, MS (Orthopaedics)', exp: 15, langs: ['English', 'Hindi', 'Punjabi'] },
  { first: 'Leena', last: 'Fernandiz', gender: 'FEMALE', dept: 'ORTH', quals: 'MBBS, DNB (Orthopaedics)', exp: 6, langs: ['English', 'Konkani'] },
  { first: 'Siddharth', last: 'Iyengaar', gender: 'MALE', dept: 'ENT', quals: 'MBBS, MS (ENT)', exp: 10, langs: ['English', 'Tamil'] },
  { first: 'Priyanka', last: 'Chaudhury', gender: 'FEMALE', dept: 'OBG', quals: 'MBBS, MS (OBG)', exp: 13, langs: ['English', 'Bengali', 'Hindi'] },
  { first: 'Kavya', last: 'Narayanswamy', gender: 'FEMALE', dept: 'OBG', quals: 'MBBS, DGO', exp: 9, langs: ['English', 'Kannada', 'Telugu'] },
  { first: 'Tarun', last: 'Mehrotri', gender: 'MALE', dept: 'PATH', quals: 'MBBS, MD (Pathology)', exp: 16, langs: ['English', 'Hindi'] },
  { first: 'Zoya', last: 'Contractorwala', gender: 'FEMALE', dept: 'PATH', quals: 'MBBS, MD (Radiodiagnosis)', exp: 8, langs: ['English', 'Gujarati'] },
  { first: 'Neel', last: 'Sahasrabuddhe', gender: 'MALE', dept: 'GM', quals: 'MBBS, MD (General Medicine)', exp: 5, langs: ['English', 'Marathi', 'Hindi'] },
];

const FIRST = ['Aditi', 'Kabir', 'Sana', 'Vivaan', 'Anaya', 'Ishaan', 'Myra', 'Reyansh', 'Diya', 'Arnav', 'Kiara', 'Yash', 'Tara', 'Dev', 'Nisha', 'Rahul', 'Pooja', 'Aman', 'Riya', 'Karan', 'Sneha', 'Nikhil', 'Fatima', 'Joseph', 'Harpreet'];
const LAST = ['Demo-Sharma', 'Samplekar', 'Testwala', 'Exampler', 'Mockrani', 'Fictio', 'Placeholdar', 'Sampath-Demo', 'Rao-Sample', 'Khan-Demo'];
const CITIES = [['Pune', 'Maharashtra'], ['Mumbai', 'Maharashtra'], ['Bengaluru', 'Karnataka'], ['Nashik', 'Maharashtra'], ['Mysuru', 'Karnataka']] as const;

const MEDICATIONS = [
  ['Paracetamol', '500 mg', 'Tablet', 'Oral'], ['Paracetamol', '650 mg', 'Tablet', 'Oral'], ['Paracetamol', '120 mg/5 ml', 'Syrup', 'Oral'],
  ['Ibuprofen', '400 mg', 'Tablet', 'Oral'], ['Amoxicillin', '500 mg', 'Capsule', 'Oral'], ['Amoxicillin + Clavulanic acid', '625 mg', 'Tablet', 'Oral'],
  ['Azithromycin', '500 mg', 'Tablet', 'Oral'], ['Cetirizine', '10 mg', 'Tablet', 'Oral'], ['Levocetirizine', '5 mg', 'Tablet', 'Oral'],
  ['Pantoprazole', '40 mg', 'Tablet', 'Oral'], ['Omeprazole', '20 mg', 'Capsule', 'Oral'], ['Ondansetron', '4 mg', 'Tablet', 'Oral'],
  ['Metformin', '500 mg', 'Tablet', 'Oral'], ['Amlodipine', '5 mg', 'Tablet', 'Oral'], ['Telmisartan', '40 mg', 'Tablet', 'Oral'],
  ['Atorvastatin', '10 mg', 'Tablet', 'Oral'], ['Salbutamol', '100 mcg/dose', 'Inhaler', 'Inhalation'], ['Montelukast', '10 mg', 'Tablet', 'Oral'],
  ['Oral rehydration salts', 'WHO formula', 'Powder', 'Oral'], ['Vitamin D3 (Cholecalciferol)', '60000 IU', 'Capsule', 'Oral'], ['Calcium carbonate', '500 mg', 'Tablet', 'Oral'],
  ['Clotrimazole', '1%', 'Cream', 'Topical'], ['Mupirocin', '2%', 'Ointment', 'Topical'], ['Xylometazoline', '0.1%', 'Nasal spray', 'Nasal'],
  ['Diclofenac', '1%', 'Gel', 'Topical'], ['Folic acid', '5 mg', 'Tablet', 'Oral'], ['Iron + Folic acid', '100 mg + 0.5 mg', 'Tablet', 'Oral'],
  ['Levothyroxine', '50 mcg', 'Tablet', 'Oral'], ['Dextromethorphan', '10 mg/5 ml', 'Syrup', 'Oral'], ['Zinc sulphate', '20 mg', 'Tablet', 'Oral'],
] as const;

const INVESTIGATIONS = [
  { code: 'CBC', name: 'Complete Blood Count', category: 'BLOOD' as const, sampleType: 'Blood (EDTA)', parameters: [
    { code: 'HGB', name: 'Haemoglobin', unit: 'g/dL', refLow: 12, refHigh: 16 },
    { code: 'WBC', name: 'Total leucocyte count', unit: '10^3/µL', refLow: 4, refHigh: 11 },
    { code: 'PLT', name: 'Platelet count', unit: '10^3/µL', refLow: 150, refHigh: 410 },
  ] },
  { code: 'FBS', name: 'Fasting Blood Sugar', category: 'BLOOD' as const, sampleType: 'Blood (Fluoride)', parameters: [{ code: 'FBS', name: 'Glucose, fasting', unit: 'mg/dL', refLow: 70, refHigh: 100 }] },
  { code: 'HBA1C', name: 'HbA1c', category: 'BLOOD' as const, sampleType: 'Blood (EDTA)', parameters: [{ code: 'HBA1C', name: 'Glycated haemoglobin', unit: '%', refLow: 4, refHigh: 5.6 }] },
  { code: 'LIPID', name: 'Lipid Profile', category: 'BLOOD' as const, sampleType: 'Serum', parameters: [
    { code: 'CHOL', name: 'Total cholesterol', unit: 'mg/dL', refHigh: 200 },
    { code: 'TG', name: 'Triglycerides', unit: 'mg/dL', refHigh: 150 },
    { code: 'HDL', name: 'HDL cholesterol', unit: 'mg/dL', refLow: 40 },
    { code: 'LDL', name: 'LDL cholesterol', unit: 'mg/dL', refHigh: 130 },
  ] },
  { code: 'TSH', name: 'Thyroid Stimulating Hormone', category: 'BLOOD' as const, sampleType: 'Serum', parameters: [{ code: 'TSH', name: 'TSH', unit: 'µIU/mL', refLow: 0.4, refHigh: 4.5 }] },
  { code: 'CREAT', name: 'Serum Creatinine', category: 'BLOOD' as const, sampleType: 'Serum', parameters: [{ code: 'CREAT', name: 'Creatinine', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3 }] },
  { code: 'VITD', name: 'Vitamin D (25-OH)', category: 'BLOOD' as const, sampleType: 'Serum', parameters: [{ code: 'VITD', name: '25-OH Vitamin D', unit: 'ng/mL', refLow: 30, refHigh: 100 }] },
  { code: 'URINE-R', name: 'Urine Routine & Microscopy', category: 'URINE' as const, sampleType: 'Urine', parameters: [
    { code: 'U-PH', name: 'pH', unit: '', refLow: 4.5, refHigh: 8 },
    { code: 'U-PROT', name: 'Protein', refText: 'Nil' },
    { code: 'U-PUS', name: 'Pus cells', unit: '/hpf', refLow: 0, refHigh: 5 },
  ] },
  { code: 'CXR', name: 'Chest X-ray (PA view)', category: 'IMAGING' as const, sampleType: null, parameters: [{ code: 'CXR-IMP', name: 'Impression', refText: 'Radiologist impression' }] },
  { code: 'ECG', name: 'Electrocardiogram (12-lead)', category: 'ECG' as const, sampleType: null, parameters: [{ code: 'ECG-HR', name: 'Ventricular rate', unit: 'bpm', refLow: 60, refHigh: 100 }, { code: 'ECG-IMP', name: 'Interpretation', refText: 'Clinician interpretation' }] },
];

async function main() {
  log('resetting database');
  await reset();
  const roleIds = await seedRbac();
  const pw = await hashPassword(PASSWORD);

  log('organization & facilities');
  const org = await prisma.organization.create({ data: { name: 'Demo Health Network', code: 'DEMO', uhidPrefix: 'DHN', uhidPadding: 8, settings: { ...DEFAULT_SETTINGS } } });
  const facilities: Record<string, { id: string }> = {};
  for (const f of FACILITIES) {
    const address = await prisma.address.create({ data: { line1: f.line1, city: f.city, state: f.state, postalCode: f.postal, country: 'IN' } });
    facilities[f.code] = await prisma.facility.create({ data: { organizationId: org.id, name: f.name, code: f.code, type: f.type, phone: f.phone, email: `${f.code.toLowerCase()}@example.test`, addressId: address.id, registrationNo: `DEMO-FAC-${f.code}` } });
  }
  const depts: Record<string, { id: string; facilityId: string }> = {};
  const rooms: Record<string, string[]> = {};
  for (const d of DEPARTMENTS) {
    const facilityId = facilities[d.facility]!.id;
    depts[d.code] = await prisma.department.create({ data: { facilityId, name: d.name, code: d.code, description: `${d.name} outpatient services (demo)` } });
    rooms[d.code] = [];
    for (let i = 1; i <= 2; i += 1) {
      const r = await prisma.consultationRoom.create({ data: { facilityId, departmentId: depts[d.code]!.id, name: `${d.name} Room ${i}`, code: `${d.code}-${i}` } });
      rooms[d.code]!.push(r.id);
    }
  }
  const nextHoliday = addDays(localDate(new Date(), TZ), 20);
  await prisma.facilityHoliday.create({ data: { facilityId: facilities.RSC!.id, date: dateOnly(nextHoliday), name: 'Demo facility holiday' } });

  log('reference data');
  await prisma.medication.createMany({ data: MEDICATIONS.map(([genericName, strength, form, route]) => ({ genericName, strength, form, route })) });
  for (const i of INVESTIGATIONS) await prisma.investigation.create({ data: { code: i.code, name: i.name, category: i.category, sampleType: i.sampleType, parameters: i.parameters } });
  // Demo defaults only — must be reviewed/configured by the organization's clinical governance.
  await prisma.vitalReferenceRange.createMany({
    data: [
      { organizationId: org.id, type: 'HEART_RATE', ageMinYears: 18, ageMaxYears: 150, low: 60, high: 100, urgentLow: 40, urgentHigh: 130, unit: 'bpm' },
      { organizationId: org.id, type: 'HEART_RATE', ageMinYears: 6, ageMaxYears: 17, low: 70, high: 110, urgentLow: 50, urgentHigh: 150, unit: 'bpm' },
      { organizationId: org.id, type: 'HEART_RATE', ageMinYears: 0, ageMaxYears: 5, low: 80, high: 140, urgentLow: 60, urgentHigh: 180, unit: 'bpm' },
      { organizationId: org.id, type: 'BLOOD_PRESSURE', ageMinYears: 18, ageMaxYears: 150, low: 90, high: 139, urgentHigh: 180, low2: 60, high2: 89, unit: 'mmHg' },
      { organizationId: org.id, type: 'RESPIRATORY_RATE', ageMinYears: 18, ageMaxYears: 150, low: 12, high: 20, urgentLow: 8, urgentHigh: 30, unit: 'breaths/min' },
      { organizationId: org.id, type: 'TEMPERATURE', ageMinYears: 0, ageMaxYears: 150, low: 36.1, high: 37.5, urgentHigh: 40, unit: '°C' },
      { organizationId: org.id, type: 'OXYGEN_SATURATION', ageMinYears: 0, ageMaxYears: 150, low: 95, high: 100, urgentLow: 90, unit: '%' },
      { organizationId: org.id, type: 'BMI', ageMinYears: 18, ageMaxYears: 150, low: 18.5, high: 24.9, unit: 'kg/m²' },
    ],
  });
  await prisma.retentionPolicy.createMany({
    data: [
      { organizationId: org.id, resourceType: 'MedicalRecord', retainYears: 3, action: 'REVIEW', legalBasisNote: 'PLACEHOLDER — confirm applicable retention periods with legal counsel before production use.' },
      { organizationId: org.id, resourceType: 'AuditLog', retainYears: 7, action: 'ARCHIVE', legalBasisNote: 'PLACEHOLDER — confirm with legal counsel.' },
    ],
  });
  for (const f of Object.values(facilities)) {
    await prisma.service.createMany({
      data: [
        { facilityId: f.id, code: 'CONSULT', name: 'Consultation', category: 'CONSULTATION', price: '500.00', taxRatePct: '0' },
        { facilityId: f.id, code: 'CBC', name: 'Complete Blood Count', category: 'DIAGNOSTIC', price: '350.00', taxRatePct: '0' },
        { facilityId: f.id, code: 'LIPID', name: 'Lipid Profile', category: 'DIAGNOSTIC', price: '650.00', taxRatePct: '0' },
        { facilityId: f.id, code: 'ECG', name: 'ECG', category: 'DIAGNOSTIC', price: '300.00', taxRatePct: '0' },
        { facilityId: f.id, code: 'DRESS', name: 'Wound dressing', category: 'PROCEDURE', price: '250.00', taxRatePct: '18' },
      ],
    });
  }

  log('staff accounts');
  const staff = async (email: string, displayName: string, roles: { role: RoleKey; facilityId?: string }[], organizationId: string | null = org.id) =>
    prisma.user.create({ data: { email, displayName, organizationId, passwordHash: pw, roles: { create: roles.map((r) => ({ roleId: roleIds[r.role], facilityId: r.facilityId ?? null })) } } });
  await staff('superadmin.demo@example.test', 'Demo Super Admin', [{ role: 'SUPER_ADMIN' }]);
  await staff('admin.demo@example.test', 'Demo Hospital Admin', [{ role: 'HOSPITAL_ADMIN' }]);
  await staff('reception.demo@example.test', 'Demo Receptionist', [{ role: 'RECEPTIONIST' }]);
  await staff('reception.lakeview@example.test', 'Lakeview Receptionist', [{ role: 'RECEPTIONIST', facilityId: facilities.LVH!.id }]);
  await staff('nurse.demo@example.test', 'Demo Nurse', [{ role: 'NURSE', facilityId: facilities.RSC!.id }]);
  const labUser = await staff('lab.demo@example.test', 'Demo Lab Technician', [{ role: 'LAB_TECHNICIAN' }]);
  await staff('pharmacist.demo@example.test', 'Demo Pharmacist', [{ role: 'PHARMACIST' }]);
  await staff('accountant.demo@example.test', 'Demo Accountant', [{ role: 'ACCOUNTANT' }]);

  log('doctors & schedules');
  const doctorIds: string[] = [];
  const doctorDept: Record<string, string> = {};
  const today = localDate(new Date(), TZ);
  const validFrom = addDays(today, -120);
  for (const [i, d] of DOCTORS.entries()) {
    const dept = DEPARTMENTS.find((x) => x.code === d.dept)!;
    const facilityId = facilities[dept.facility]!.id;
    const email = i === 0 ? 'doctor.demo@example.test' : i === 14 ? 'doctor.test@example.test' : `dr.${d.first.toLowerCase()}.${d.last.toLowerCase().replace(/[^a-z]/g, '')}@example.test`;
    const user = await staff(email, `Dr. ${d.first} ${d.last}`, [{ role: 'DOCTOR', facilityId }]);
    const fee = [400, 500, 600, 700, 800, 1000][i % 6]!;
    const types: AppointmentType[] = ['IN_PERSON', 'FOLLOW_UP', ...(i % 3 === 0 || i === 14 ? (['TELECONSULTATION'] as AppointmentType[]) : [])];
    const profile = await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        displayName: `Dr. ${d.first} ${d.last}`,
        qualifications: d.quals,
        specialty: dept.specialty,
        experienceYears: d.exp,
        registrationNumber: `DEMO-REG-${String(10001 + i)}`,
        registrationCouncil: 'Demo Medical Council (fictional)',
        bio: `Fictional demo profile. ${dept.specialty} with ${d.exp} years of experience.`,
        languages: d.langs,
        gender: d.gender,
        consultationFee: `${fee}.00`,
        teleconsultationFee: types.includes('TELECONSULTATION') ? `${fee - 100}.00` : null,
        consultationTypes: types,
        departments: { create: { departmentId: depts[d.dept]!.id, facilityId } },
      },
    });
    doctorIds.push(profile.id);
    doctorDept[profile.id] = d.dept;
    const room = rooms[d.dept]![i % 2]!;
    const sched = (dow: number, startTime: string, endTime: string, extra: { slotMinutes?: number; breaks?: { start: string; end: string }[]; maxAppointments?: number; overbookPerSlot?: number } = {}) =>
      prisma.doctorSchedule.create({
        data: { doctorId: profile.id, facilityId, departmentId: depts[d.dept]!.id, roomId: room, dayOfWeek: dow, startTime, endTime, breaks: extra.breaks ?? [], slotMinutes: extra.slotMinutes ?? 15, bufferMinutes: 0, maxAppointments: extra.maxAppointments ?? null, overbookPerSlot: extra.overbookPerSlot ?? 0, consultationTypes: [], validFrom: dateOnly(validFrom) },
      });
    if (i === 14) {
      // Dedicated automated-test doctor: bookable around the clock in 5-minute slots so same-day
      // flows (including the teleconsultation join window) run deterministically at any hour.
      for (let dow = 0; dow <= 6; dow += 1) await sched(dow, '00:00', '23:59', { slotMinutes: 5 });
    } else if (i === 0) {
      // Primary demo doctor: long daily session so the demo works on any day.
      for (let dow = 0; dow <= 6; dow += 1) await sched(dow, '08:00', '22:00', { breaks: [{ start: '13:00', end: '14:00' }] });
    } else {
      for (let dow = 1; dow <= 6; dow += 1) {
        await sched(dow, '09:00', '13:00', { breaks: [{ start: '11:00', end: '11:15' }] });
        await sched(dow, '17:00', '20:00', { slotMinutes: 20, maxAppointments: 8, overbookPerSlot: i === 1 ? 1 : 0 });
      }
    }
  }
  const leaveDay = addDays(today, 10);
  await prisma.doctorLeave.create({ data: { doctorId: doctorIds[5]!, type: 'LEAVE', startAt: zonedToUtc(leaveDay, '00:00', TZ), endAt: zonedToUtc(addDays(leaveDay, 1), '00:00', TZ), reason: 'Conference (demo)' } });

  log('patients');
  const patientIds: string[] = [];
  const patientRole = roleIds.PATIENT;
  for (let i = 0; i < 50; i += 1) {
    const first = i === 0 ? 'Priya' : i === 1 ? 'Arjun' : FIRST[i % FIRST.length]!;
    const last = i === 0 ? 'Demo-Patient' : i === 1 ? 'Second-Demo' : LAST[i % LAST.length]!;
    const fullName = `${first} ${last}`;
    const dob = i === 0 ? '1990-04-12' : i === 1 ? '1985-11-02' : `${int(1950, 2018)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
    const [city, state] = pick(CITIES);
    const mobile = `+9198${String(76510001 + i * 37)}`;
    const email = i === 0 ? 'patient.demo@example.test' : i === 1 ? 'patient2.demo@example.test' : `patient${i + 1}@example.test`;
    const user = i < 2 ? await prisma.user.create({ data: { email, displayName: fullName, phone: mobile, passwordHash: pw, roles: { create: { roleId: patientRole } } } }) : null;
    const address = await prisma.address.create({ data: { line1: `${int(1, 200)} Demo Lane`, city, state, postalCode: String(int(400001, 599999)), country: 'IN' } });
    const p = await prisma.patient.create({
      data: {
        uhid: await nextUhid(prisma, org),
        organizationId: org.id,
        userId: user?.id ?? null,
        firstName: first,
        lastName: last,
        fullName,
        nameNormalized: normalizeName(fullName),
        dateOfBirth: dateOnly(dob),
        gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
        mobile,
        email,
        addressId: address.id,
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-', 'A-']),
        contacts: { create: { name: `Emergency Contact ${i + 1}`, relationship: pick(['Spouse', 'Parent', 'Sibling']), phone: `+9197${String(10000000 + i).padStart(8, '0')}` } },
      },
    });
    patientIds.push(p.id);
    const consentAll = i % 7 !== 3;
    await prisma.notificationConsent.createMany({
      data: (['SMS', 'WHATSAPP', 'EMAIL'] as const).map((channel) => ({ patientId: p.id, channel, optedIn: consentAll || channel === 'SMS', source: 'REGISTRATION' as const, consentText: `Transactional ${channel} messages` })),
    });
    if (i % 4 === 0) await prisma.allergy.create({ data: { patientId: p.id, substance: pick(['Penicillin', 'Sulfa drugs', 'Peanuts', 'Dust mites']), reaction: pick(['Rash', 'Hives', 'Sneezing']), severity: pick(['MILD', 'MODERATE']) } });
    if (i % 3 === 0) await prisma.medicalHistoryEntry.create({ data: { patientId: p.id, type: 'CONDITION', description: pick(['Hypertension (demo)', 'Type 2 diabetes (demo)', 'Asthma (demo)', 'Hypothyroidism (demo)']) } });
  }
  // Dependent child for the primary demo patient (guardian access).
  const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: 'patient.demo@example.test' } });
  const childName = 'Anika Demo-Patient';
  const child = await prisma.patient.create({
    data: { uhid: await nextUhid(prisma, org), organizationId: org.id, firstName: 'Anika', lastName: 'Demo-Patient', fullName: childName, nameNormalized: normalizeName(childName), dateOfBirth: dateOnly('2019-06-15'), gender: 'FEMALE', mobile: null, email: null },
  });
  await prisma.patientGuardian.create({ data: { patientId: child.id, proxyUserId: demoUser.id, relationship: 'PARENT', accessLevel: 'FULL', status: 'ACTIVE', consentedAt: new Date() } });
  await prisma.healthDataSource.create({ data: { patientId: patientIds[0]!, providerType: 'MOCK', deviceName: 'Mock Wearable', permissionStatus: 'GRANTED', scopes: ['heart_rate.read'], permissionGrantedAt: new Date(), lastSyncAt: new Date() } });
  const src = await prisma.healthDataSource.findFirstOrThrow({ where: { patientId: patientIds[0]! } });
  await prisma.healthDataReading.createMany({
    data: [72, 74, 71, 73].map((bpm, k) => ({ patientId: patientIds[0]!, sourceId: src.id, metric: 'HEART_RATE', value: bpm, unit: 'bpm', measuredAt: new Date(Date.now() - (k + 1) * 3_600_000), context: 'RESTING', validation: 'VALID' as const, flag: 'WITHIN_RANGE' as const, externalId: `seed-${k}`, accuracyMeta: { confidence: 'demo' } })),
  });

  log('appointments, encounters, vitals');
  const reception = await prisma.user.findUniqueOrThrow({ where: { email: 'reception.demo@example.test' } });
  const slotTimes = ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30'];
  const used = new Set<string>();
  const completedAppts: { id: string; doctorId: string; patientId: string; facilityId: string; date: string; startAt: Date }[] = [];
  let apptCount = 0;

  async function createAppt(doctorId: string, patientId: string, date: string, time: string, status: AppointmentStatus, extra: { type?: AppointmentType; reason?: string } = {}) {
    const key = `${doctorId}|${date}|${time}`;
    if (used.has(key)) return null;
    used.add(key);
    const dept = depts[doctorDept[doctorId]!]!;
    const startAt = zonedToUtc(date, time, TZ);
    const appt = await prisma.appointment.create({
      data: {
        appointmentNumber: await nextNumber(prisma, 'APT', startAt),
        facilityId: dept.facilityId,
        departmentId: dept.id,
        doctorId,
        patientId,
        bookedById: reception.id,
        type: extra.type ?? 'IN_PERSON',
        status,
        source: rand() > 0.5 ? 'PORTAL' : 'RECEPTION',
        startAt,
        endAt: new Date(startAt.getTime() + 15 * 60_000),
        reason: extra.reason ?? pick(['Fever and cough', 'Routine check-up', 'Follow-up review', 'Skin rash', 'Joint pain', 'Headache', 'Blood pressure review']),
        confirmedAt: new Date(startAt.getTime() - 86_400_000),
        ...(status === 'COMPLETED' ? { checkedInAt: startAt, consultationStartedAt: startAt, completedAt: new Date(startAt.getTime() + 12 * 60_000) } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: new Date(startAt.getTime() - 3_600_000 * 5), cancelReason: 'Patient request (demo)' } : {}),
        ...(status === 'NO_SHOW' ? { noShowAt: new Date(startAt.getTime() + 30 * 60_000) } : {}),
      },
    });
    await prisma.appointmentStatusHistory.createMany({ data: [{ appointmentId: appt.id, toStatus: 'BOOKED' }, { appointmentId: appt.id, fromStatus: 'BOOKED', toStatus: 'CONFIRMED' }, ...(status !== 'CONFIRMED' ? [{ appointmentId: appt.id, fromStatus: 'CONFIRMED' as const, toStatus: status }] : [])] });
    apptCount += 1;
    return appt;
  }

  // Past appointments (last ~60 days) — skip the dedicated test doctor (index 14) to keep it clean.
  const seededDoctors = doctorIds.slice(0, 14);
  for (let k = 0; k < 90; k += 1) {
    const back = int(1, 60);
    let date = addDays(today, -back);
    while (dayOfWeek(date) === 0) date = addDays(date, -1);
    const doctorId = k < 25 ? doctorIds[0]! : pick(seededDoctors);
    const patientId = k < 6 ? patientIds[0]! : k < 9 ? patientIds[1]! : pick(patientIds.slice(2));
    const status: AppointmentStatus = k % 11 === 5 ? 'CANCELLED' : k % 13 === 7 ? 'NO_SHOW' : 'COMPLETED';
    const a = await createAppt(doctorId, patientId, date, pick(slotTimes), status);
    if (a && status === 'COMPLETED') completedAppts.push({ id: a.id, doctorId, patientId, facilityId: a.facilityId, date, startAt: a.startAt });
  }
  // Today (for the primary demo doctor) and upcoming appointments.
  const todayTimes = ['09:30', '10:00', '10:30', '11:30', '12:00', '12:30', '17:00', '17:20', '17:40', '18:00'];
  const todayDow = dayOfWeek(today);
  const demoToday = todayDow === 0 ? ['10:00', '11:00', '12:00', '15:00', '16:00', '17:00'] : todayTimes;
  for (const [k, t] of demoToday.entries()) await createAppt(doctorIds[0]!, patientIds[2 + k]!, today, t, 'CONFIRMED');
  for (let k = 0; k < 20; k += 1) {
    let date = addDays(today, int(1, 21));
    while (dayOfWeek(date) === 0) date = addDays(date, 1);
    await createAppt(pick(seededDoctors), pick(patientIds.slice(1)), date, pick(slotTimes), 'CONFIRMED');
  }
  let upcomingDemo = addDays(today, 3);
  while (dayOfWeek(upcomingDemo) === 0) upcomingDemo = addDays(upcomingDemo, 1);
  await createAppt(doctorIds[2]!, child.id, upcomingDemo, '10:00', 'CONFIRMED', { reason: 'Vaccination review' });
  await createAppt(doctorIds[0]!, patientIds[0]!, upcomingDemo, '11:30', 'CONFIRMED', { reason: 'Follow-up review' });

  log(`clinical records for ${completedAppts.length} completed visits`);
  const lab = await loadPrincipal(labUser.id, 'seed');
  const accountantless = await loadPrincipal(reception.id, 'seed');
  const cbc = await prisma.investigation.findUniqueOrThrow({ where: { code: 'CBC' } });
  const meds = await prisma.medication.findMany();
  const dx = [['Acute upper respiratory infection', 'J06.9'], ['Essential hypertension', 'I10'], ['Allergic rhinitis', 'J30.4'], ['Contact dermatitis', 'L25.9'], ['Low back pain', 'M54.5'], ['Gastritis', 'K29.7']] as const;
  const sorted = completedAppts.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (const [k, a] of sorted.entries()) {
    const patient = await prisma.patient.findUniqueOrThrow({ where: { id: a.patientId } });
    const [desc, code] = pick(dx);
    const enc = await prisma.encounter.create({
      data: {
        encounterNumber: await nextNumber(prisma, 'ENC', a.startAt),
        appointmentId: a.id,
        patientId: a.patientId,
        doctorId: a.doctorId,
        facilityId: a.facilityId,
        status: 'COMPLETED',
        chiefComplaint: 'Presenting complaint recorded (demo)',
        historyOfIllness: 'Fictional history of present illness for demonstration.',
        examinationFindings: 'General examination unremarkable (demo).',
        assessmentNotes: `Assessment: ${desc} (demo).`,
        planNotes: 'Symptomatic management; review if symptoms persist.',
        followUpDate: dateOnly(addDays(a.date, 14)),
        startedAt: a.startAt,
        completedAt: new Date(a.startAt.getTime() + 12 * 60_000),
        diagnoses: { create: { patientId: a.patientId, description: desc, code, codeSystem: 'ICD10', type: 'PRIMARY', recordedById: 'seed' } },
        notes: { create: { authorId: 'seed', type: 'GENERAL', content: 'Consultation note (fictional demo data).', status: 'FINAL', finalizedAt: a.startAt } },
      },
    });
    const hr = k % 9 === 4 ? 108 : int(66, 88);
    const vitals = [
      { type: 'HEART_RATE' as const, value: hr, unit: 'bpm' },
      { type: 'BLOOD_PRESSURE' as const, value: int(110, 138), value2: int(70, 88), unit: 'mmHg' },
      { type: 'TEMPERATURE' as const, value: 36.5 + int(0, 12) / 10, unit: '°C' },
      { type: 'OXYGEN_SATURATION' as const, value: int(96, 99), unit: '%' },
      { type: 'WEIGHT' as const, value: int(45, 85), unit: 'kg' },
    ];
    for (const v of vitals) {
      await prisma.vital.create({
        data: { patientId: a.patientId, encounterId: enc.id, type: v.type, value: v.value, value2: 'value2' in v ? v.value2 : null, unit: v.unit, measuredAt: new Date(a.startAt.getTime() + 2 * 60_000), source: 'MANUAL', context: 'RESTING', recordedById: 'seed', flag: await flagMeasurement(patient, v.type, v.value, 'value2' in v ? (v.value2 ?? null) : null, 'RESTING') },
      });
    }
    // Prescriptions for ~2/3 of visits, finalized through the real service (immutable versions + PDF).
    if (k % 3 !== 2) {
      const doc = await loadPrincipal((await prisma.doctorProfile.findUniqueOrThrow({ where: { id: a.doctorId } })).userId, 'seed');
      const draft = await prisma.prescription.create({ data: { prescriptionNumber: await nextNumber(prisma, 'RX', a.startAt), patientId: a.patientId, doctorId: a.doctorId, encounterId: enc.id, advice: 'Adequate rest and oral fluids. Return if symptoms worsen.', followUpDate: dateOnly(addDays(a.date, 14)) } });
      const chosen = [pick(meds), pick(meds), ...(k % 2 ? [pick(meds)] : [])];
      await prisma.prescriptionItem.createMany({
        data: chosen.map((m, idx) => ({ prescriptionId: draft.id, medicationId: m.id, medicineName: m.genericName, strength: m.strength, dose: m.form === 'Tablet' || m.form === 'Capsule' ? '1 ' + m.form.toLowerCase() : 'As directed', route: m.route, frequency: pick(['Once daily', 'Twice daily', 'Three times daily']), timing: pick(['After food', 'Before food', 'At bedtime']), durationDays: pick([3, 5, 7, 14]), quantity: null, instructions: null, refills: 0, sortOrder: idx })),
      });
      if (doc) await rx.finalize(doc, draft.id);
    }
    // Lab orders for some visits, processed through the lab services (results → verify → release).
    if (k % 4 === 1 && lab) {
      const order = await prisma.investigationOrder.create({ data: { orderNumber: await nextNumber(prisma, 'ORD', a.startAt), patientId: a.patientId, doctorId: a.doctorId, encounterId: enc.id, facilityId: a.facilityId, investigationId: cbc.id, priority: 'ROUTINE', status: 'COLLECTED', collectedAt: new Date(a.startAt.getTime() + 30 * 60_000), createdAt: a.startAt } });
      await inv.enterResults(lab, order.id, [
        { parameterCode: 'HGB', valueNumeric: Number((12 + rand() * 2.2).toFixed(1)) },
        { parameterCode: 'WBC', valueNumeric: Number((5 + rand() * 5).toFixed(1)) },
        { parameterCode: 'PLT', valueNumeric: int(170, 380) },
      ]);
      await inv.verify(lab, order.id);
    }
    if (accountantless && k % 2 === 0) {
      const invc = await billing.invoiceForAppointment(accountantless, a.id);
      await billing.pay(accountantless, invc.id, { method: pick(['CASH', 'UPI', 'CARD'] as const) });
    }
  }

  // A pending (not yet collected) order for the lab worklist demo.
  const recentEnc = await prisma.encounter.findFirst({ where: { doctorId: doctorIds[0]! }, orderBy: { startedAt: 'desc' } });
  if (recentEnc) {
    const lipid = await prisma.investigation.findUniqueOrThrow({ where: { code: 'LIPID' } });
    await prisma.investigationOrder.create({ data: { orderNumber: await nextNumber(prisma, 'ORD'), patientId: recentEnc.patientId, doctorId: doctorIds[0]!, encounterId: recentEnc.id, facilityId: recentEnc.facilityId, investigationId: lipid.id, priority: 'URGENT', clinicalNotes: 'Fasting sample (demo)' } });
  }

  const counts = {
    facilities: await prisma.facility.count(),
    departments: await prisma.department.count(),
    doctors: await prisma.doctorProfile.count(),
    patients: await prisma.patient.count(),
    appointments: await prisma.appointment.count(),
    prescriptions: await prisma.prescription.count({ where: { status: 'FINALIZED' } }),
    investigations: await prisma.investigationOrder.count(),
    vitals: await prisma.vital.count(),
    notifications: await prisma.notification.count(),
  };
  log(`done ${JSON.stringify(counts)} (created ${apptCount} appointments in this run)`);
  log(`demo accounts use password from SEED_DEMO_PASSWORD (default for local dev: ${process.env.SEED_DEMO_PASSWORD ? '[env]' : 'Demo@12345'})`);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`[seed] failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
