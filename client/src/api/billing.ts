import { api } from './client';
import type { BillableService, Invoice } from '../types/domain';

export const billingApi = {
  invoices: (q: { patientId?: string; status?: string; page?: number }) => api.page<Invoice>('/billing/invoices', { ...q, pageSize: 20 }),
  invoice: (id: string) => api.get<Invoice>(`/billing/invoices/${id}`),
  invoiceForAppointment: (appointmentId: string) => api.post<Invoice>(`/billing/appointments/${appointmentId}/invoice`),
  pay: (id: string, method: 'CASH' | 'CARD' | 'UPI' | 'ONLINE', idempotencyKey: string, amount?: string) =>
    api.post<Invoice>(`/billing/invoices/${id}/payments`, { method, ...(amount ? { amount } : {}) }, { idempotencyKey }),
  refund: (paymentId: string, reason: string, amount?: string) =>
    api.post<Invoice>(`/billing/payments/${paymentId}/refund`, { reason, ...(amount ? { amount } : {}) }),
  services: (facilityId: string) => api.get<BillableService[]>('/billing/services', { facilityId }),
  upsertService: (body: { facilityId: string; code: string; name: string; category: BillableService['category']; price: string; taxRatePct: string; isActive?: boolean }) =>
    api.put<BillableService>('/billing/services', body),
};
