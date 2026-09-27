import { api } from './client';
import type { Investigation, InvestigationOrder, InvestigationStatus, LabTrendPoint } from '../types/domain';

export interface ResultInput {
  parameterCode: string;
  valueNumeric?: number;
  valueText?: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  abnormal?: boolean;
}

export const investigationsApi = {
  catalog: (q?: string) => api.get<Investigation[]>('/investigations/catalog', { q }),
  worklist: (status?: string, page = 1) => api.page<InvestigationOrder>('/investigations/worklist', { status, page, pageSize: 25 }),
  listForPatient: (patientId: string, accessReason?: string) =>
    api.get<InvestigationOrder[]>(`/investigations/patients/${patientId}`, undefined, accessReason ? { accessReason } : {}),
  trend: (patientId: string, parameterCode: string, accessReason?: string) =>
    api.get<LabTrendPoint[]>(`/investigations/patients/${patientId}/trend`, { parameterCode }, accessReason ? { accessReason } : {}),
  order: (id: string) => api.get<InvestigationOrder>(`/investigations/orders/${id}`),
  setStatus: (id: string, status: InvestigationStatus, reason?: string) =>
    api.post<InvestigationOrder>(`/investigations/orders/${id}/status`, { status, ...(reason ? { reason } : {}) }),
  enterResults: (id: string, results: ResultInput[], correctionReason?: string) =>
    api.post<InvestigationOrder>(`/investigations/orders/${id}/results`, { results, ...(correctionReason ? { correctionReason } : {}) }),
  uploadReport: (id: string, file: File, summary?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (summary) form.append('summary', summary);
    return api.upload<InvestigationOrder>(`/investigations/orders/${id}/report`, form);
  },
  verify: (id: string) => api.post<InvestigationOrder>(`/investigations/orders/${id}/verify`),
};
