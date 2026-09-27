export interface PaymentInput {
  amount: string; // decimal string, INR
  currency: string;
  invoiceNumber: string;
  method: 'CASH' | 'CARD' | 'UPI' | 'ONLINE';
  idempotencyKey: string;
}

export interface PaymentResult {
  status: 'PAID' | 'AUTHORIZED' | 'PENDING' | 'FAILED';
  providerRef?: string;
  failureReason?: string;
}

export interface RefundResult {
  ok: boolean;
  providerRef?: string;
  failureReason?: string;
}

/** Payment gateway abstraction. Raw card data never touches this system (use hosted checkout). */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: PaymentInput): Promise<PaymentResult>;
  refund(providerRef: string, amount: string): Promise<RefundResult>;
}
