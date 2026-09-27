/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { createPatient, uid } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';

test.describe('billing (mock payments)', () => {
  test('consultation invoice → partial UPI → cash balance → refund', async ({ as, refs }) => {
    const reception = await as('reception');
    const accountant = await as('accountant');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const inv = expectOk(await reception.post(`/api/billing/appointments/${appointment.id}/invoice`), 201) as any;
    expect(inv.status).toBe('ISSUED');
    const total = Number(inv.total);
    const partial = expectOk(await reception.post(`/api/billing/invoices/${inv.id}/payments`, { method: 'UPI', amount: '100.00' }), 201) as any;
    expect(partial.status).toBe('PARTIALLY_PAID');
    const paid = expectOk(await reception.post(`/api/billing/invoices/${inv.id}/payments`, { method: 'CASH' }), 201) as any;
    expect(paid.status).toBe('PAID');
    expect(Number(paid.amountPaid)).toBe(total);
    expectError(await reception.post(`/api/billing/payments/${paid.payments[0].id}/refund`, { reason: 'test' }), 403);
    const refunded = expectOk(await accountant.post(`/api/billing/payments/${paid.payments[0].id}/refund`, { amount: '50.00', reason: 'Goodwill' })) as any;
    expect(refunded.status).toBe('PARTIALLY_PAID');
  });

  test('declined card (.13) → 402 PAYMENT_FAILED; payment idempotency', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const inv = expectOk(await reception.post('/api/billing/invoices', { patientId: p.id, facilityId: refs.rscFacilityId, items: [{ description: 'Dressing', quantity: 1, unitPrice: '250.13' }] }), 201) as any;
    expectError(await reception.post(`/api/billing/invoices/${inv.id}/payments`, { method: 'CARD' }), 402, 'PAYMENT_FAILED');
    const inv2 = expectOk(await reception.post('/api/billing/invoices', { patientId: p.id, facilityId: refs.rscFacilityId, items: [{ description: 'Dressing', quantity: 2, unitPrice: '250.00', discount: '50.00' }] }), 201) as any;
    expect(inv2.total).toBe('450');
    const key = `pay-${uid()}`;
    expectOk(await reception.post(`/api/billing/invoices/${inv2.id}/payments`, { method: 'UPI' }, { idempotencyKey: key }), 201);
    await new Promise((r) => setTimeout(r, 300));
    const again = await reception.post(`/api/billing/invoices/${inv2.id}/payments`, { method: 'UPI' }, { idempotencyKey: key });
    expect(again.status).toBe(201);
    expect(again.body.data.payments).toHaveLength(1);
  });
});
