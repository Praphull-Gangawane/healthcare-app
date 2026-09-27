import { api } from './client';
import type { MedicalDocument } from '../types/domain';

export const documentsApi = {
  list: (patientId: string, accessReason?: string) =>
    api.get<MedicalDocument[]>(`/documents/patients/${patientId}`, undefined, accessReason ? { accessReason } : {}),
  upload: (input: { patientId: string; file: File; title?: string; type?: string; encounterId?: string }) => {
    const form = new FormData();
    form.append('patientId', input.patientId);
    if (input.title) form.append('title', input.title);
    if (input.type) form.append('type', input.type);
    if (input.encounterId) form.append('encounterId', input.encounterId);
    form.append('file', input.file);
    return api.upload<MedicalDocument>('/documents', form);
  },
  url: (id: string) => api.get<{ url: string; expiresAt: string }>(`/documents/${id}/url`),
  /** Resolves the short-lived URL and downloads the file body (authenticated). */
  fetchFile: async (id: string) => {
    const { url } = await documentsApi.url(id);
    return api.blob(url);
  },
};
