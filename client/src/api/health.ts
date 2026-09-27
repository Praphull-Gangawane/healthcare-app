import { api } from './client';
import type { HealthProviderType, HealthReading, HealthSource, Vital } from '../types/domain';

export const healthApi = {
  sources: (patientId: string, accessReason?: string) =>
    api.get<HealthSource[]>(`/health-data/patients/${patientId}/sources`, undefined, accessReason ? { accessReason } : {}),
  connect: (patientId: string, body: { providerType: HealthProviderType; deviceName?: string; clientReportedStatus?: 'GRANTED' | 'DENIED' }) =>
    api.post<HealthSource>(`/health-data/patients/${patientId}/sources`, body),
  revoke: (patientId: string, providerType: HealthProviderType) =>
    api.del<HealthSource>(`/health-data/patients/${patientId}/sources/${providerType}`),
  sync: (patientId: string, providerType: HealthProviderType = 'MOCK') =>
    api.post<HealthReading[]>(`/health-data/patients/${patientId}/sync`, { providerType }),
  ingest: (patientId: string, providerType: HealthProviderType, readings: { bpm: number; measuredAt: string; externalId: string; context?: string; deviceName?: string }[]) =>
    api.post<HealthReading[]>(`/health-data/patients/${patientId}/readings`, { providerType, readings }),
  readings: (patientId: string, accessReason?: string) =>
    api.get<HealthReading[]>(`/health-data/patients/${patientId}/readings`, undefined, accessReason ? { accessReason } : {}),
  promote: (readingId: string, encounterId?: string) =>
    api.post<Vital>(`/health-data/readings/${readingId}/promote`, encounterId ? { encounterId } : {}),
};
