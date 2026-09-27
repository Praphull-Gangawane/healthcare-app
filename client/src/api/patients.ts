import { api } from './client';
import type {
  ConsentHistoryRow,
  ConsentState,
  Dependent,
  MedicalProfile,
  Patient,
  PatientDetail,
  TimelineItem,
  TimelineType,
} from '../types/domain';

export interface PatientSearchQuery {
  q?: string;
  uhid?: string;
  mobile?: string;
  dateOfBirth?: string;
  appointmentNumber?: string;
  page?: number;
  pageSize?: number;
}

export const patientsApi = {
  search: (q: PatientSearchQuery) => api.page<Patient>('/patients', { ...q }),
  create: (body: unknown) => api.post<Patient>('/patients', body),
  get: (id: string, accessReason?: string) => api.get<PatientDetail>(`/patients/${id}`, undefined, accessReason ? { accessReason } : {}),
  update: (id: string, body: unknown) => api.patch<Patient>(`/patients/${id}`, body),
  medicalProfile: (id: string, accessReason?: string) =>
    api.get<MedicalProfile>(`/patients/${id}/medical-profile`, undefined, accessReason ? { accessReason } : {}),
  timeline: (id: string, types?: TimelineType[], accessReason?: string) =>
    api.get<TimelineItem[]>(`/patients/${id}/timeline`, { types: types?.length ? types.join(',') : undefined }, accessReason ? { accessReason } : {}),
  dependents: () => api.get<Dependent[]>('/patients/me/dependents'),
  addDependent: (body: unknown) =>
    api.post<{ patient: Patient; proxy: { id: string; status: string; relationship: string; isMinor: boolean } }>('/patients/me/dependents', body),
  consents: (id: string) => api.get<{ current: ConsentState[]; history: ConsentHistoryRow[] }>(`/patients/${id}/consents`),
  setConsent: (id: string, channel: ConsentState['channel'], optedIn: boolean) =>
    api.put<{ current: ConsentState[] }>(`/patients/${id}/consents`, { channel, optedIn }),
  proxies: (id: string) =>
    api.get<{ id: string; status: string; relationship: string; accessLevel: string; proxy: { displayName: string; email: string } }[]>(`/patients/${id}/proxies`),
  activateProxy: (id: string, proxyId: string) => api.post<unknown>(`/patients/${id}/proxies/${proxyId}/activate`),
};
