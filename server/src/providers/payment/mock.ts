import crypto from 'node:crypto';
import type { PaymentInput, PaymentProvider, PaymentResult, RefundResult } from './types.js';

/**
 * Deterministic mock gateway: amounts ending in `.13` are declined; everything else succeeds.
 * CASH is recorded as PAID immediately.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock-payments';

  createPayment(input: PaymentInput): Promise<PaymentResult> {
    if (input.amount.endsWith('.13')) {
      return Promise.resolve({ status: 'FAILED', failureReason: 'MOCK_DECLINED' });
    }
    return Promise.resolve({ status: 'PAID', providerRef: `mockpay_${crypto.randomUUID()}` });
  }

  refund(providerRef: string): Promise<RefundResult> {
    return Promise.resolve({ ok: true, providerRef: `${providerRef}_refund_${Date.now()}` });
  }
}
