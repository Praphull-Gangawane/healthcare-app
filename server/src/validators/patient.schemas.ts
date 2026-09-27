import { z } from 'zod';
import { email, isoDate, longText, mobile, pagination, shortText } from './common.js';

export const genderEnum = z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']);
const bloodGroup = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']);

export const addressSchema = z.object({
  line1: shortText,
  line2: z.string().trim().max(200).optional(),
  city: shortText,
  state: shortText,
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code').optional(),
  country: z.string().trim().length(2).default('IN'),
});

export const emergencyContactSchema = z.object({
  name: shortText,
  relationship: shortText,
  phone: mobile,
});

const dob = isoDate.refine((d) => {
  const t = Date.parse(d);
  return !Number.isNaN(t) && t <= Date.now() && t > Date.parse('1900-01-01');
}, 'Enter a valid date of birth');

export const medicalProfileSchema = z.object({
  bloodGroup: bloodGroup.optional(),
  allergies: z
    .array(z.object({ substance: shortText, reaction: z.string().trim().max(200).optional(), severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN']).default('UNKNOWN') }))
    .max(50)
    .default([]),
  conditions: z.array(shortText).max(50).default([]),
  currentMedications: z.array(shortText).max(50).default([]),
  surgeries: z.array(shortText).max(50).default([]),
  familyHistory: z.array(shortText).max(50).default([]),
  notes: longText.optional(),
});

export const consentInputSchema = z.object({
  sms: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  email: z.boolean().default(false),
});

export const patientCoreSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  dateOfBirth: dob,
  gender: genderEnum,
  mobile: mobile.optional(),
  email: email.optional(),
  address: addressSchema.optional(),
  emergencyContact: emergencyContactSchema.optional(),
  customFields: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});

export const createPatientSchema = patientCoreSchema.extend({
  medicalProfile: medicalProfileSchema.optional(),
  consents: consentInputSchema.optional(),
  /** Staff only: proceed even though possible duplicates were found (audited). */
  confirmNotDuplicate: z.boolean().optional(),
});

export const updatePatientSchema = patientCoreSchema.partial().extend({
  bloodGroup: bloodGroup.optional(),
});

export const registerSchema = createPatientSchema
  .omit({ confirmNotDuplicate: true, email: true })
  .extend({
    email,
    password: z.string(),
    mobile,
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms and privacy notice' }) }),
    organizationCode: z.string().max(40).optional(),
  });

export const searchPatientsSchema = pagination.extend({
  q: z.string().trim().max(100).optional(),
  uhid: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(20).optional(),
  dateOfBirth: isoDate.optional(),
  email: z.string().trim().max(254).optional(),
  appointmentNumber: z.string().trim().max(40).optional(),
});

export const addDependentSchema = patientCoreSchema.extend({
  relationship: z.enum(['PARENT', 'CHILD', 'SPOUSE', 'LEGAL_GUARDIAN', 'CAREGIVER', 'OTHER']),
  medicalProfile: medicalProfileSchema.optional(),
  /** Required for adult dependents: caregiver attests that the adult has consented. */
  adultConsentAttestation: z.boolean().optional(),
});

export const allergySchema = z.object({
  substance: shortText,
  reaction: z.string().trim().max(200).optional(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN']).default('UNKNOWN'),
});

export const historyEntrySchema = z.object({
  type: z.enum(['CONDITION', 'SURGERY', 'FAMILY_HISTORY', 'CURRENT_MEDICATION', 'NOTE']),
  description: z.string().trim().min(1).max(500),
  onsetDate: isoDate.optional(),
});

export const timelineQuerySchema = z.object({
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()) : undefined)),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const intakeSchema = z.object({
  chiefComplaint: z.string().trim().min(1).max(500),
  symptoms: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  symptomDuration: z.string().trim().max(100).optional(),
  existingConditions: z.string().trim().max(1000).optional(),
  allergiesText: z.string().trim().max(1000).optional(),
  currentMedications: z.string().trim().max(1000).optional(),
  answers: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
});

export const consentUpdateSchema = z.object({
  channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL']),
  optedIn: z.boolean(),
});
