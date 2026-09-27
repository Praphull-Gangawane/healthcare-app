import type { NavSection } from '../components/Sidebar';
import type { RoleKey } from '../types/domain';

export const PATIENT_NAV: NavSection[] = [
  {
    items: [
      { to: '/portal', label: 'Home', icon: 'home', end: true },
      { to: '/portal/appointments', label: 'Appointments', icon: 'calendar' },
      { to: '/portal/prescriptions', label: 'Prescriptions', icon: 'pill' },
      { to: '/portal/reports', label: 'Test reports', icon: 'flask' },
      { to: '/portal/timeline', label: 'Medical timeline', icon: 'list' },
      { to: '/portal/documents', label: 'Documents', icon: 'file' },
      { to: '/portal/health-data', label: 'Health data', icon: 'heart' },
      { to: '/portal/billing', label: 'Bills & payments', icon: 'wallet' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/portal/profile', label: 'My profile', icon: 'user' },
      { to: '/portal/dependents', label: 'My dependents', icon: 'users' },
      { to: '/portal/notifications', label: 'Notification settings', icon: 'bell' },
      { to: '/portal/privacy', label: 'Privacy & my data', icon: 'shield' },
    ],
  },
];

export const DOCTOR_NAV: NavSection[] = [
  {
    items: [
      { to: '/doctor', label: 'Today', icon: 'home', end: true },
      { to: '/doctor/patients', label: 'Find patient', icon: 'search' },
    ],
  },
];

export const RECEPTION_NAV: NavSection[] = [
  {
    items: [
      { to: '/reception', label: 'Front desk', icon: 'home', end: true },
      { to: '/reception/appointments', label: 'Appointments', icon: 'calendar' },
      { to: '/reception/patients', label: 'Find patient', icon: 'search' },
      { to: '/reception/register', label: 'Register patient', icon: 'plus' },
      { to: '/reception/book', label: 'Book appointment', icon: 'calendar' },
      { to: '/reception/walk-in', label: 'Walk-in', icon: 'users' },
      { to: '/reception/queue', label: 'Queue', icon: 'queue' },
      { to: '/reception/invoices', label: 'Invoices', icon: 'wallet' },
    ],
  },
];

export const NURSE_NAV: NavSection[] = [{ items: [{ to: '/nurse', label: 'Queue & vitals', icon: 'activity', end: true }] }];
export const LAB_NAV: NavSection[] = [{ items: [{ to: '/lab', label: 'Worklist', icon: 'flask', end: true }] }];
export const BILLING_NAV: NavSection[] = [
  {
    items: [
      { to: '/billing', label: 'Invoices', icon: 'wallet', end: true },
      { to: '/billing/revenue', label: 'Revenue report', icon: 'chart' },
    ],
  },
];
export const PHARMACY_NAV: NavSection[] = [{ items: [{ to: '/pharmacy', label: 'Dispensing', icon: 'pill', end: true }] }];

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { to: '/admin', label: 'Overview', icon: 'home', end: true },
      { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { to: '/admin/users', label: 'Users & roles', icon: 'users' },
      { to: '/admin/doctors', label: 'Doctors & schedules', icon: 'stethoscope' },
      { to: '/admin/facilities', label: 'Facilities', icon: 'building' },
      { to: '/admin/services', label: 'Services & fees', icon: 'wallet' },
      { to: '/admin/reference-ranges', label: 'Reference ranges', icon: 'activity' },
      { to: '/admin/settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    label: 'Oversight',
    items: [
      { to: '/admin/notifications', label: 'Notification log', icon: 'bell' },
      { to: '/admin/audit', label: 'Audit log', icon: 'shieldCheck' },
      { to: '/admin/privacy', label: 'Privacy requests', icon: 'shield' },
    ],
  },
];

export interface AreaConfig {
  roles: RoleKey[];
  nav: NavSection[];
  navLabel: string;
  home: string;
  roleText: string;
  profileHref?: string;
}

export const AREAS: Record<string, AreaConfig> = {
  portal: { roles: ['PATIENT'], nav: PATIENT_NAV, navLabel: 'Patient portal', home: '/portal', roleText: 'Patient portal', profileHref: '/portal/profile' },
  doctor: { roles: ['DOCTOR'], nav: DOCTOR_NAV, navLabel: 'Doctor', home: '/doctor', roleText: 'Doctor workspace' },
  reception: { roles: ['RECEPTIONIST'], nav: RECEPTION_NAV, navLabel: 'Reception', home: '/reception', roleText: 'Front desk' },
  nurse: { roles: ['NURSE'], nav: NURSE_NAV, navLabel: 'Nursing', home: '/nurse', roleText: 'Nursing station' },
  lab: { roles: ['LAB_TECHNICIAN'], nav: LAB_NAV, navLabel: 'Laboratory', home: '/lab', roleText: 'Laboratory' },
  billing: { roles: ['ACCOUNTANT'], nav: BILLING_NAV, navLabel: 'Billing', home: '/billing', roleText: 'Accounts' },
  pharmacy: { roles: ['PHARMACIST'], nav: PHARMACY_NAV, navLabel: 'Pharmacy', home: '/pharmacy', roleText: 'Pharmacy' },
  admin: { roles: ['HOSPITAL_ADMIN', 'SUPER_ADMIN'], nav: ADMIN_NAV, navLabel: 'Administration', home: '/admin', roleText: 'Administration' },
};
