import { api } from './client';
import type { PublicQueueDisplay, QueueTokenRow, QueueView } from '../types/domain';

export const queueApi = {
  view: (doctorId: string, facilityId: string, date?: string) => api.get<QueueView>('/queue', { doctorId, facilityId, date }),
  display: (queueId: string) => api.get<PublicQueueDisplay>(`/queue/display/${queueId}`, undefined, { skipSessionRedirect: true }),
  callNext: (queueId: string) => api.post<QueueTokenRow>(`/queue/${queueId}/call-next`),
  recall: (tokenId: string) => api.post<QueueTokenRow>(`/queue/tokens/${tokenId}/recall`),
  skip: (tokenId: string) => api.post<QueueTokenRow>(`/queue/tokens/${tokenId}/skip`),
  requeue: (tokenId: string) => api.post<QueueTokenRow>(`/queue/tokens/${tokenId}/requeue`),
  absent: (tokenId: string) => api.post<QueueTokenRow>(`/queue/tokens/${tokenId}/absent`),
  transfer: (tokenId: string, doctorId: string) => api.post<QueueTokenRow>(`/queue/tokens/${tokenId}/transfer`, { doctorId }),
};
