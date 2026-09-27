import { api } from './client';
import type { NotificationRow } from '../types/domain';

export interface SecureLinkTarget {
  purpose: 'PRESCRIPTION_VIEW' | 'LAB_REPORT_VIEW' | 'DOCUMENT_VIEW';
  resourceType: string;
  resourceId: string;
  patientId: string;
}

export const notificationsApi = {
  log: (q: { status?: string; channel?: string; page?: number }) => api.page<NotificationRow>('/notifications', { ...q, pageSize: 25 }),
  mine: () => api.get<{ id: string; channel: string; templateKey: string; status: string; createdAt: string }[]>('/notifications/mine'),
  retry: (id: string) => api.post<{ status: string }>(`/notifications/${id}/retry`),
  resolveSecureLink: (token: string) => api.post<SecureLinkTarget>('/notifications/secure-links/resolve', { token }),
};
