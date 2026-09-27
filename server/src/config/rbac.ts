/**
 * RBAC catalogue — source of truth for seeded roles/permissions. Roles and grants live in the DB
 * (Role, Permission, RolePermission, UserRole) so they can be extended without code changes.
 * Permissions are coarse capabilities; resource-level rules (organization, facility, care
 * relationship, patient ownership/proxy) are enforced by policy functions in services/access.
 */
export const PERMISSIONS = {
  'portal:self': 'Patient portal access to own/proxy records',
  'patient:create': 'Register patients',
  'patient:read': 'Read patient demographics',
  'patient:update': 'Update patient demographics',
  'patient:search': 'Search patients',
  'clinical:read': 'Read clinical records (subject to care-relationship policy)',
  'clinical:write': 'Write clinical records',
  'clinical:break_glass': 'Emergency access to clinical records outside care relationship (reason required, audited)',
  'appointment:read': 'Read appointments',
  'appointment:book_self': 'Book appointments for self/dependents',
  'appointment:manage': 'Book/reschedule/cancel appointments for any patient in scope',
  'appointment:checkin': 'Check patients in / mark no-show',
  'queue:read': 'View queues',
  'queue:manage': 'Manage queue tokens',
  'encounter:write': 'Start and document consultations',
  'vital:read': 'Read vitals',
  'vital:write': 'Record vitals',
  'prescription:read': 'Read prescriptions',
  'prescription:write': 'Create/edit draft prescriptions',
  'prescription:finalize': 'Finalize and amend prescriptions',
  'prescription:dispense_read': 'Read finalized prescriptions for dispensing',
  'investigation:order': 'Order investigations',
  'investigation:read': 'Read investigation orders/results',
  'investigation:process': 'Process orders and enter results',
  'investigation:verify': 'Verify lab reports',
  'document:upload': 'Upload medical documents',
  'document:read': 'Read medical documents',
  'billing:read': 'Read invoices and payments',
  'billing:manage': 'Create invoices and record payments',
  'payment:refund': 'Issue refunds',
  'notification:read': 'Read notification delivery logs',
  'notification:manage': 'Send/retry notifications and run reminders',
  'report:operational': 'Operational reports',
  'report:financial': 'Financial reports',
  'report:clinical': 'Clinical reports',
  'audit:read': 'Read audit trail',
  'user:manage': 'Manage users and role grants',
  'role:manage': 'Manage roles and permissions',
  'org:manage': 'Manage organizations',
  'facility:manage': 'Manage facilities, departments and rooms',
  'doctor:manage': 'Manage doctor profiles',
  'schedule:manage': 'Manage doctor schedules and leave',
  'service:manage': 'Manage billable services and fees',
  'reference_range:manage': 'Configure vital reference ranges',
  'healthdata:read': 'Read patient-shared health data',
  'teleconsult:host': 'Host teleconsultations',
  'teleconsult:join': 'Join own teleconsultations',
  'privacy:manage': 'Handle privacy requests (export/correction/deactivation)',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'HOSPITAL_ADMIN',
  'RECEPTIONIST',
  'DOCTOR',
  'NURSE',
  'LAB_TECHNICIAN',
  'PHARMACIST',
  'ACCOUNTANT',
  'PATIENT',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_GRANTS: Record<RoleKey, { name: string; permissions: PermissionKey[] }> = {
  SUPER_ADMIN: {
    name: 'Super administrator',
    permissions: [
      'org:manage', 'facility:manage', 'user:manage', 'role:manage', 'audit:read', 'report:operational',
      'notification:read', 'notification:manage', 'doctor:manage', 'schedule:manage', 'service:manage',
    ],
  },
  HOSPITAL_ADMIN: {
    name: 'Hospital administrator',
    permissions: [
      'facility:manage', 'user:manage', 'doctor:manage', 'schedule:manage', 'service:manage', 'patient:read',
      'patient:search', 'appointment:read', 'queue:read', 'report:operational', 'report:financial', 'audit:read',
      'notification:read', 'notification:manage', 'billing:read', 'privacy:manage',
    ],
  },
  RECEPTIONIST: {
    name: 'Receptionist',
    permissions: [
      'patient:create', 'patient:read', 'patient:update', 'patient:search', 'appointment:read',
      'appointment:manage', 'appointment:checkin', 'queue:read', 'queue:manage', 'billing:read', 'billing:manage',
      'document:upload', 'notification:read',
    ],
  },
  DOCTOR: {
    name: 'Doctor',
    permissions: [
      'patient:read', 'patient:search', 'clinical:read', 'clinical:write', 'clinical:break_glass',
      'appointment:read', 'appointment:manage', 'queue:read', 'queue:manage', 'encounter:write', 'vital:read',
      'vital:write', 'prescription:read', 'prescription:write', 'prescription:finalize', 'investigation:order',
      'investigation:read', 'document:upload', 'document:read', 'report:clinical', 'healthdata:read',
      'teleconsult:host', 'reference_range:manage',
    ],
  },
  NURSE: {
    name: 'Nurse',
    permissions: [
      'patient:read', 'patient:search', 'clinical:read', 'vital:read', 'vital:write', 'appointment:read',
      'appointment:checkin', 'queue:read', 'queue:manage', 'document:read', 'healthdata:read',
    ],
  },
  LAB_TECHNICIAN: {
    name: 'Lab technician',
    permissions: ['investigation:read', 'investigation:process', 'investigation:verify', 'document:upload'],
  },
  PHARMACIST: {
    name: 'Pharmacist',
    permissions: ['prescription:dispense_read'],
  },
  ACCOUNTANT: {
    name: 'Accountant',
    permissions: ['billing:read', 'billing:manage', 'payment:refund', 'report:financial'],
  },
  PATIENT: {
    name: 'Patient',
    permissions: ['portal:self', 'appointment:book_self', 'teleconsult:join'],
  },
};

/** Roles considered "clinical staff" for care-relationship checks. */
export const CLINICAL_ROLES: RoleKey[] = ['DOCTOR', 'NURSE'];
