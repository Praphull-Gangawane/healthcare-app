import { api } from './client';
import type { Appointment, AppointmentType, Intake } from '../types/domain';

export interface BookInput {
  doctorId: string;
  patientId: string;
  startAt: string;
  type: AppointmentType;
  reason?: string;
  facilityId?: string;
  followUpOfId?: string;
}

export interface AppointmentQuery {
  date?: string;
  from?: string;
  to?: string;
  doctorId?: string;
  facilityId?: string;
  patientId?: string;
  status?: string;
  mine?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface IntakeInput {
  chiefComplaint: string;
  symptoms: string[];
  symptomDuration?: string;
  existingConditions?: string;
  allergiesText?: string;
  currentMedications?: string;
}

export const appointmentsApi = {
  list: (q: AppointmentQuery) => api.page<Appointment>('/appointments', { ...q, mine: q.mine ? 'true' : undefined }),
  get: (id: string) => api.get<Appointment>(`/appointments/${id}`),
  hold: (input: BookInput, idempotencyKey: string) => api.post<Appointment>('/appointments/holds', input, { idempotencyKey }),
  confirm: (id: string, reason: string | undefined, idempotencyKey: string) =>
    api.post<Appointment>(`/appointments/${id}/confirm`, reason ? { reason } : {}, { idempotencyKey }),
  book: (input: BookInput, idempotencyKey: string) => api.post<Appointment>('/appointments', input, { idempotencyKey }),
  walkIn: (input: { patientId: string; doctorId: string; facilityId: string; reason?: string; urgent?: boolean }, idempotencyKey: string) =>
    api.post<Appointment>('/appointments/walk-ins', input, { idempotencyKey }),
  cancel: (id: string, reason?: string) => api.post<Appointment>(`/appointments/${id}/cancel`, reason ? { reason } : {}),
  reschedule: (id: string, startAt: string, idempotencyKey: string, reason?: string) =>
    api.post<Appointment>(`/appointments/${id}/reschedule`, { startAt, ...(reason ? { reason } : {}) }, { idempotencyKey }),
  checkIn: (id: string) => api.post<Appointment>(`/appointments/${id}/check-in`),
  noShow: (id: string) => api.post<Appointment>(`/appointments/${id}/no-show`),
  getIntake: (id: string) => api.get<Intake | null>(`/appointments/${id}/intake`),
  putIntake: (id: string, body: IntakeInput) => api.put<Intake>(`/appointments/${id}/intake`, body),
  joinTeleconsult: (id: string, consent: boolean) =>
    api.post<{ provider: string; token?: string; joinUrl?: string; expiresAt?: string; mock: boolean; [k: string]: unknown }>(
      `/teleconsultation/appointments/${id}/join`,
      { consent },
    ),
};
