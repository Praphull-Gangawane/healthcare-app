import { api } from './client';
import type { AuditRow, PrivacyRequest } from '../types/domain';

export const privacyApi = {
  exportData: (patientId: string) => api.get<unknown>(`/privacy/patients/${patientId}/export`),
  createRequest: (body: { patientId: string; type: PrivacyRequest['type']; details?: string }) => api.post<PrivacyRequest>('/privacy/requests', body),
  mine: () => api.get<PrivacyRequest[]>('/privacy/requests/mine'),
  list: () => api.get<PrivacyRequest[]>('/privacy/requests'),
  resolve: (id: string, status: 'IN_REVIEW' | 'COMPLETED' | 'REJECTED', resolution: string) =>
    api.post<PrivacyRequest>(`/privacy/requests/${id}/resolve`, { status, resolution }),
};

export const auditApi = {
  list: (q: { action?: string; resourceType?: string; resourceId?: string; actorUserId?: string; from?: string; to?: string; page?: number }) =>
    api.page<AuditRow>('/audit', { ...q, pageSize: 25 }),
};
