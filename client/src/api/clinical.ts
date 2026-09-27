import { api } from './client';
import type {
  Diagnosis,
  DiagnosisType,
  Encounter,
  InvestigationOrder,
  Medication,
  OrderPriority,
  Prescription,
  PrescriptionItem,
  PrescriptionListItem,
  Vital,
  VitalTrendPoint,
  VitalType,
} from '../types/domain';

export interface MeasurementInput {
  type: VitalType;
  value: number;
  value2?: number;
  unit: string;
  measuredAt?: string;
}

export interface SoapDraft {
  version: number;
  chiefComplaint?: string;
  historyOfIllness?: string;
  examinationFindings?: string;
  assessmentNotes?: string;
  planNotes?: string;
  followUpDate?: string | null;
  followUpInstructions?: string;
}

export interface PrescriptionDraftPatch {
  advice?: string;
  followUpDate?: string | null;
  investigationNotes?: string;
  items?: PrescriptionItem[];
}

const reason = (accessReason?: string) => (accessReason ? { accessReason } : {});

export const encountersApi = {
  start: (appointmentId: string, idempotencyKey: string) => api.post<Encounter>('/encounters', { appointmentId }, { idempotencyKey }),
  get: (id: string) => api.get<Encounter>(`/encounters/${id}`),
  saveDraft: (id: string, body: SoapDraft) => api.patch<Encounter>(`/encounters/${id}`, body),
  addDiagnosis: (id: string, body: { description: string; code?: string; codeSystem: 'ICD10' | 'FREE_TEXT'; type: DiagnosisType }) =>
    api.post<Diagnosis>(`/encounters/${id}/diagnoses`, body),
  removeDiagnosis: (diagnosisId: string) => api.del<{ removed: boolean }>(`/encounters/diagnoses/${diagnosisId}`),
  recordVitals: (id: string, measurements: MeasurementInput[]) => api.post<Vital[]>(`/encounters/${id}/vitals`, { measurements }),
  order: (id: string, body: { investigationId: string; priority: OrderPriority; clinicalNotes?: string }) =>
    api.post<InvestigationOrder>(`/encounters/${id}/orders`, body),
  createPrescription: (id: string) => api.post<Prescription>(`/encounters/${id}/prescriptions`),
  complete: (id: string, body: { followUpDate?: string; followUpInstructions?: string }, idempotencyKey: string) =>
    api.post<Encounter>(`/encounters/${id}/complete`, body, { idempotencyKey }),
};

export const vitalsApi = {
  list: (patientId: string, type?: VitalType, accessReason?: string) =>
    api.get<Vital[]>(`/vitals/patients/${patientId}`, { type, limit: 100 }, reason(accessReason)),
  trend: (patientId: string, type: VitalType, accessReason?: string) =>
    api.get<VitalTrendPoint[]>(`/vitals/patients/${patientId}/trend`, { type }, reason(accessReason)),
  record: (patientId: string, measurements: MeasurementInput[], context?: string) =>
    api.post<Vital[]>(`/vitals/patients/${patientId}`, { measurements, ...(context ? { context } : {}) }),
};

export const prescriptionsApi = {
  searchMedications: (q: string) => api.get<Medication[]>('/prescriptions/medications', { q }),
  listForPatient: (patientId: string, accessReason?: string) =>
    api.get<PrescriptionListItem[]>(`/prescriptions/patients/${patientId}`, undefined, reason(accessReason)),
  get: (id: string) => api.get<Prescription>(`/prescriptions/${id}`),
  updateDraft: (id: string, body: PrescriptionDraftPatch) => api.patch<Prescription>(`/prescriptions/${id}`, body),
  finalize: (id: string, idempotencyKey: string) => api.post<Prescription>(`/prescriptions/${id}/finalize`, { confirm: true }, { idempotencyKey }),
  amend: (id: string, body: { reason: string; items: PrescriptionItem[]; advice?: string; followUpDate?: string | null }, idempotencyKey: string) =>
    api.post<Prescription>(`/prescriptions/${id}/amend`, body, { idempotencyKey }),
  discard: (id: string) => api.del<{ discarded: boolean }>(`/prescriptions/${id}`),
};
