import { api } from './client';
import type { AppointmentType, Department, Doctor, FacilitySummary, Slot } from '../types/domain';

export interface DoctorFilters {
  q?: string;
  specialty?: string;
  departmentId?: string;
  facilityId?: string;
  language?: string;
  consultationType?: AppointmentType | '';
  page?: number;
  pageSize?: number;
  withNextSlot?: boolean;
}

export const directoryApi = {
  facilities: () => api.get<FacilitySummary[]>('/directory/facilities'),
  departments: (facilityId?: string) => api.get<Department[]>('/directory/departments', { facilityId }),
  specialties: () => api.get<string[]>('/directory/specialties'),
  doctors: (f: DoctorFilters) =>
    api.page<Doctor>('/directory/doctors', {
      q: f.q,
      specialty: f.specialty,
      departmentId: f.departmentId,
      facilityId: f.facilityId,
      language: f.language,
      consultationType: f.consultationType || undefined,
      page: f.page,
      pageSize: f.pageSize ?? 12,
      withNextSlot: f.withNextSlot ? 'true' : undefined,
    }),
  doctor: (id: string) => api.get<Doctor>(`/directory/doctors/${id}`),
  availability: (doctorId: string, date: string, type?: AppointmentType, facilityId?: string) =>
    api.get<{ date: string; slots: Slot[] }>(`/directory/doctors/${doctorId}/availability`, { date, type, facilityId }),
};
