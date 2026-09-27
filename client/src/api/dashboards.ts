import { api } from './client';
import type { Appointment, InvestigationOrder, PatientRef } from '../types/domain';

export interface PatientDashboard {
  nextAppointment: Appointment | null;
  upcoming: Appointment[];
  recentPrescriptions: {
    id: string;
    prescriptionNumber: string;
    status: string;
    finalizedAt: string | null;
    currentVersion: number;
    doctor: { displayName: string };
    patient: { fullName: string };
  }[];
  recentReports: (Pick<InvestigationOrder, 'id' | 'orderNumber' | 'status' | 'releasedToPatientAt' | 'verifiedAt'> & {
    investigation: { name: string };
    patient: { fullName: string };
  })[];
  recentVisits: { id: string; encounterNumber: string; startedAt: string; completedAt: string | null; doctor: { displayName: string }; patient: { fullName: string } }[];
}

export interface DoctorDashboard {
  date: string;
  counts: { appointments: number; waiting: number; completed: number; pendingInvestigations: number; draftPrescriptions: number; followUps: number };
  current: Appointment | null;
  next: Appointment | null;
  appointments: Appointment[];
  drafts: { id: string; prescriptionNumber: string; encounterId: string; patient: { fullName: string }; updatedAt: string }[];
  followUps: { id: string; followUpDate: string; patient: { id: string; fullName: string; uhid: string } }[];
  resultsToReview: (InvestigationOrder & { patient: PatientRef })[];
}

export interface ReceptionDashboard {
  date: string;
  counts: { scheduled: number; waiting: number; walkIns: number; newPatients: number; noShows: number; reschedules: number; cancelled: number };
  upcoming: Appointment[];
  waiting: Appointment[];
  walkIns: Appointment[];
  availableDoctors: { id: string; displayName: string; specialty: string; openSlots: number; nextSlot: string | null; departments: { facilityId: string; department: { name: string } }[] }[];
}

export interface AdminDashboard {
  range: { from: string; to: string };
  appointments: number;
  completed: number;
  cancelled: number;
  noShows: number;
  averageWaitMinutes: number | null;
  registrations: number;
  revenue: string;
  pendingPayments: string;
  pendingInvoices: number;
  doctorUtilization: { doctorId: string; name: string; appointments: number }[];
  departmentUtilization: { departmentId: string; name: string; appointments: number }[];
}

export const dashboardsApi = {
  patient: () => api.get<PatientDashboard>('/dashboards/patient'),
  doctor: (date?: string) => api.get<DoctorDashboard>('/dashboards/doctor', { date }),
  reception: (date?: string) => api.get<ReceptionDashboard>('/dashboards/reception', { date }),
  admin: (from?: string, to?: string) => api.get<AdminDashboard>('/dashboards/admin', { from, to }),
};
