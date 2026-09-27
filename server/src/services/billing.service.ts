import type { PaymentMethod, Prisma, ServiceCategory } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/ids.js';
import { computeInvoice, fromPaise, toPaise } from '../domain/money.js';
import { providers } from '../providers/index.js';
import { audit } from './audit.service.js';
import { assertFacilityScope, assertPatientAccess, portalPatientIds, staffOrg } from './access/patientAccess.js';
import { hasPermission, type Principal } from './auth/principal.js';

const invoiceInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'asc' } },
  patient: { select: { id: true, uhid: true, fullName: true } },
  facility: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

export async function listServices(facilityId: string) {
  return prisma.service.findMany({ where: { facilityId, isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
}

export async function upsertService(p: Principal, input: { facilityId: string; code: string; name: string; category: ServiceCategory; price: string; taxRatePct: string; isActive?: boolean | undefined }) {
  assertFacilityScope(p, input.facilityId);
  const row = await prisma.service.upsert({
    where: { facilityId_code: { facilityId: input.facilityId, code: input.code } },
    update: { name: input.name, category: input.category, price: input.price, taxRatePct: input.taxRatePct, isActive: input.isActive ?? true },
    create: { facilityId: input.facilityId, code: input.code, name: input.name, category: input.category, price: input.price, taxRatePct: input.taxRatePct },
  });
  await audit({ actor: p, action: 'service.upsert', resourceType: 'Service', resourceId: row.id, after: { code: row.code, price: String(row.price) } });
  return row;
}

export interface InvoiceItemInput {
  serviceId?: string | undefined;
  description?: string | undefined;
  quantity: number;
  unitPrice?: string | undefined;
  discount?: string | undefined;
}

export async function createInvoice(p: Principal, input: { patientId: string; facilityId: string; appointmentId?: string | undefined; items: InvoiceItemInput[]; discount?: string | undefined }) {
  if (!hasPermission(p, 'billing:manage')) throw new AppError('FORBIDDEN', 'You cannot create invoices.');
  await assertPatientAccess(p, input.patientId, 'billing');
  assertFacilityScope(p, input.facilityId);
  if (!input.items.length) throw new AppError('VALIDATION_ERROR', 'Add at least one item.');

  const lines: { serviceId: string | null; description: string; quantity: number; unitPrice: string; discount: string; taxRatePct: string }[] = [];
  for (const it of input.items) {
    const svc = it.serviceId ? await prisma.service.findFirst({ where: { id: it.serviceId, facilityId: input.facilityId, isActive: true } }) : null;
    if (it.serviceId && !svc) throw notFound('Service');
    const unitPrice = it.unitPrice ?? (svc ? String(svc.price) : undefined);
    if (!unitPrice) throw new AppError('VALIDATION_ERROR', 'Each item needs a service or a price.');
    lines.push({ serviceId: svc?.id ?? null, description: it.description ?? svc?.name ?? 'Service', quantity: it.quantity, unitPrice, discount: it.discount ?? '0', taxRatePct: svc ? String(svc.taxRatePct) : '0' });
  }
  const totals = computeInvoice(lines, input.discount ?? '0');
  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber: await nextNumber(tx, 'INV'),
        facilityId: input.facilityId,
        patientId: input.patientId,
        appointmentId: input.appointmentId ?? null,
        status: 'ISSUED',
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        issuedAt: new Date(),
        createdById: p.userId,
        items: {
          create: totals.lines.map((l, i) => ({
            serviceId: lines[i]?.serviceId ?? null,
            description: lines[i]?.description ?? 'Service',
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            taxRatePct: l.taxRatePct,
            amount: l.amount,
          })),
        },
      },
      include: invoiceInclude,
    });
    await audit({ actor: p, action: 'invoice.create', resourceType: 'Invoice', resourceId: inv.id, after: { total: totals.total } }, tx);
    return inv;
  });
  return invoice;
}

/** Convenience: consultation invoice from the doctor's configured fee. */
export async function invoiceForAppointment(p: Principal, appointmentId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true, invoices: true } });
  if (!appt) throw notFound('Appointment');
  const existing = appt.invoices.find((i) => i.status !== 'VOID');
  if (existing) return prisma.invoice.findUniqueOrThrow({ where: { id: existing.id }, include: invoiceInclude });
  const fee = appt.type === 'TELECONSULTATION' && appt.doctor.teleconsultationFee ? appt.doctor.teleconsultationFee : appt.doctor.consultationFee;
  const consult = await prisma.service.findFirst({ where: { facilityId: appt.facilityId, category: 'CONSULTATION', isActive: true } });
  return createInvoice(p, {
    patientId: appt.patientId,
    facilityId: appt.facilityId,
    appointmentId,
    items: [{ serviceId: consult?.id, description: `Consultation — ${appt.doctor.displayName}`, quantity: 1, unitPrice: String(fee) }],
  });
}

async function loadInvoice(p: Principal, invoiceId: string, forPayment: boolean) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: invoiceInclude });
  if (!inv) throw notFound('Invoice');
  const portal = await portalPatientIds(p, 'billing');
  if (portal.includes(inv.patientId)) return { inv, portal: true };
  if (!hasPermission(p, forPayment ? 'billing:manage' : 'billing:read')) throw new AppError('FORBIDDEN', 'Billing access required.');
  await assertPatientAccess(p, inv.patientId, 'billing');
  return { inv, portal: false };
}

export const getInvoice = async (p: Principal, id: string) => (await loadInvoice(p, id, false)).inv;

export async function listInvoices(p: Principal, q: { patientId?: string | undefined; status?: string | undefined; skip: number; take: number }) {
  const portal = await portalPatientIds(p, 'billing');
  const where: Prisma.InvoiceWhereInput = {};
  if (!hasPermission(p, 'billing:read')) {
    where.patientId = q.patientId && portal.includes(q.patientId) ? q.patientId : { in: portal };
  } else {
    where.facility = { organizationId: staffOrg(p) };
    if (p.facilityScope !== 'ALL') where.facilityId = { in: p.facilityScope };
    if (q.patientId) where.patientId = q.patientId;
  }
  if (q.status) where.status = q.status as never;
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total };
}

export async function pay(p: Principal, invoiceId: string, input: { amount?: string | undefined; method: PaymentMethod }, idempotencyKey?: string) {
  const { inv, portal } = await loadInvoice(p, invoiceId, true);
  if (portal && input.method === 'CASH') throw new AppError('VALIDATION_ERROR', 'Cash payments are recorded at the reception desk.');
  if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) throw new AppError('INVALID_STATE_TRANSITION', 'This invoice is not payable.');
  const due = toPaise(String(inv.total)) - toPaise(String(inv.amountPaid));
  const amountPaise = input.amount ? toPaise(input.amount) : due;
  if (amountPaise <= 0 || amountPaise > due) throw new AppError('VALIDATION_ERROR', `Amount must be between 0.01 and ${fromPaise(due)}.`);
  const amount = fromPaise(amountPaise);

  if (idempotencyKey) {
    const prior = await prisma.payment.findUnique({ where: { idempotencyKey: `${p.userId}:${idempotencyKey}` } });
    if (prior) return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
  }
  const result =
    input.method === 'CASH'
      ? { status: 'PAID' as const, providerRef: `cash_${Date.now()}` }
      : await providers.payment.createPayment({ amount, currency: inv.currency, invoiceNumber: inv.invoiceNumber, method: input.method, idempotencyKey: idempotencyKey ?? `${invoiceId}:${Date.now()}` });

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        amount,
        method: input.method,
        status: result.status,
        provider: input.method === 'CASH' ? 'cash' : providers.payment.name,
        providerRef: result.providerRef ?? null,
        failureReason: 'failureReason' in result ? result.failureReason ?? null : null,
        idempotencyKey: idempotencyKey ? `${p.userId}:${idempotencyKey}` : null,
        createdById: p.userId,
        paidAt: result.status === 'PAID' ? new Date() : null,
      },
    });
    if (result.status === 'PAID') {
      const paid = toPaise(String(inv.amountPaid)) + amountPaise;
      await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: fromPaise(paid), status: paid >= toPaise(String(inv.total)) ? 'PAID' : 'PARTIALLY_PAID' } });
    }
    await audit({ actor: p, action: result.status === 'PAID' ? 'payment.success' : 'payment.failed', resourceType: 'Payment', resourceId: payment.id, after: { invoiceId, amount, method: input.method, status: result.status } }, tx);
  });
  if (result.status === 'FAILED') throw new AppError('PAYMENT_FAILED', 'The payment could not be completed. No money was taken. Please try another method.');
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
}

export async function refund(p: Principal, paymentId: string, input: { amount?: string | undefined; reason: string }) {
  if (!hasPermission(p, 'payment:refund')) throw new AppError('FORBIDDEN', 'You cannot issue refunds.');
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  if (!payment) throw notFound('Payment');
  await assertPatientAccess(p, payment.invoice.patientId, 'billing');
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new AppError('INVALID_STATE_TRANSITION', 'Only completed payments can be refunded.');
  const refundable = toPaise(String(payment.amount)) - toPaise(String(payment.refundedAmount));
  const amt = input.amount ? toPaise(input.amount) : refundable;
  if (amt <= 0 || amt > refundable) throw new AppError('VALIDATION_ERROR', `Refund must be between 0.01 and ${fromPaise(refundable)}.`);
  const r = payment.provider === 'cash' ? { ok: true } : await providers.payment.refund(payment.providerRef ?? '', fromPaise(amt));
  if (!r.ok) throw new AppError('PAYMENT_FAILED', 'The refund could not be processed.');
  const refundedTotal = toPaise(String(payment.refundedAmount)) + amt;
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { refundedAmount: fromPaise(refundedTotal), refundedAt: new Date(), status: refundedTotal >= toPaise(String(payment.amount)) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    const paid = Math.max(0, toPaise(String(payment.invoice.amountPaid)) - amt);
    await tx.invoice.update({ where: { id: payment.invoiceId }, data: { amountPaid: fromPaise(paid), status: paid === 0 ? 'ISSUED' : 'PARTIALLY_PAID' } });
    await audit({ actor: p, action: 'payment.refund', resourceType: 'Payment', resourceId: paymentId, reason: input.reason, after: { amount: fromPaise(amt) } }, tx);
  });
  return prisma.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId }, include: invoiceInclude });
}
