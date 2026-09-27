import { api } from './client';
import type { QueryParams } from '../types/api';

export interface RangeFilter {
  from: string;
  to: string;
  doctorId?: string;
  departmentId?: string;
  facilityId?: string;
  status?: string;
}

export interface AppointmentReport {
  summary: Record<string, number>;
  rows: { appointmentNumber: string; startAt: string; status: string; type: string; source: string; walkIn: boolean; doctor: string; department: string; patientUhid: string }[];
}

export interface DoctorReportRow {
  doctorId: string;
  doctor: string;
  specialty: string;
  appointments: number;
  completed: number;
  cancelled: number;
  noShows: number;
}

export interface PatientReport {
  newRegistrations: number;
  newPatientsSeen: number;
  returningPatientsSeen: number;
  registrationTrend: { date: string; count: number }[];
}

export interface RevenueReport {
  consultationRevenue: string;
  serviceRevenue: string;
  refunds: string;
  collectedByMethod: Record<string, string>;
}

const q = (f: RangeFilter): QueryParams => ({ ...f });

export const reportsApi = {
  appointments: (f: RangeFilter) => api.get<AppointmentReport>('/reports/appointments', q(f)),
  doctors: (f: RangeFilter) => api.get<DoctorReportRow[]>('/reports/doctors', q(f)),
  patients: (f: RangeFilter) => api.get<PatientReport>('/reports/patients', q(f)),
  revenue: (f: RangeFilter) => api.get<RevenueReport>('/reports/revenue', q(f)),
  csv: (kind: 'appointments' | 'doctors', f: RangeFilter) => api.blob(`/reports/${kind}`, { ...q(f), format: 'csv' }),
};
