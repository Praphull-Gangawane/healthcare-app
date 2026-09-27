import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { billingApi } from '../../api/billing';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useRequiredUser } from '../../hooks/useAuth';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';
import { formatDateTime, formatMoney } from '../../utils/format';
import { invoiceStatusLabel, paymentMethodLabel, paymentStatusLabel } from '../../utils/labels';
import { hasPermission } from '../../utils/roles';

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const user = useRequiredUser();
  const qc = useQueryClient();
  const toast = useToast();
  const idem = useIdempotencyKey();
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [amount, setAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => billingApi.invoice(id) });
  const done = () => void qc.invalidateQueries({ queryKey: ['invoice', id] });
  const pay = useMutation({ mutationFn: () => idem.run(`pay:${id}:${method}:${amount}`, (k) => billingApi.pay(id, method, k, amount || undefined)), onSuccess: () => { toast.success('Payment recorded.'); setAmount(''); done(); } });
  const refund = useMutation({ mutationFn: (paymentId: string) => billingApi.refund(paymentId, refundReason), onSuccess: () => { toast.success('Refund issued.'); setRefundReason(''); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <QueryState query={q}>
        {(inv) => {
          const due = (Number(inv.total) - Number(inv.amountPaid)).toFixed(2);
          return (
            <>
              <PageHeader title={`Invoice ${inv.invoiceNumber}`} subtitle={`${inv.patient.fullName} · ${inv.facility.name}`} docTitle={inv.invoiceNumber} />
              <section className="card stack-sm">
                <StatusBadge status={inv.status} label={invoiceStatusLabel[inv.status] ?? inv.status} />
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Table (scrollable)">
                  <table className="table">
                    <caption className="visually-hidden">Invoice items</caption>
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Qty</th>
                        <th scope="col">Unit price</th>
                        <th scope="col">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((i) => (
                        <tr key={i.id}>
                          <th scope="row">{i.description}</th>
                          <td>{i.quantity}</td>
                          <td>{formatMoney(i.unitPrice)}</td>
                          <td>{formatMoney(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="kv">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(inv.subtotal)}</dd>
                  <dt>Discount</dt>
                  <dd>{formatMoney(inv.discount)}</dd>
                  <dt>Tax</dt>
                  <dd>{formatMoney(inv.tax)}</dd>
                  <dt>Total</dt>
                  <dd>
                    <strong>{formatMoney(inv.total)}</strong>
                  </dd>
                  <dt>Balance due</dt>
                  <dd>{formatMoney(due)}</dd>
                </dl>
              </section>
              {Number(due) > 0 && hasPermission(user, 'billing:manage') ? (
                <form className="card stack-sm" onSubmit={(e) => { e.preventDefault(); pay.mutate(); }}>
                  <h2>Record payment</h2>
                  {pay.isError ? <Alert tone="error">{errorMessage(pay.error)}</Alert> : null}
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="pay-method">Method</label>
                      <select id="pay-method" className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI (demo provider)</option>
                        <option value="CARD">Card (demo provider)</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="pay-amount">Amount (leave blank for full balance)</label>
                      <input id="pay-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Button type="submit" variant="primary" loading={pay.isPending}>
                      Record payment
                    </Button>
                  </div>
                </form>
              ) : null}
              <section className="card stack-sm">
                <h2>Payments</h2>
                {inv.payments.length ? (
                  <ul className="list">
                    {inv.payments.map((p) => (
                      <li key={p.id} className="list-item">
                        <div className="list-item-main">
                          <p className="list-item-title">
                            {formatMoney(p.amount)} · {paymentMethodLabel[p.method] ?? p.method}
                          </p>
                          <p className="list-item-meta">
                            {formatDateTime(p.paidAt ?? p.createdAt)} {Number(p.refundedAmount) > 0 ? `· refunded ${formatMoney(p.refundedAmount)}` : ''} {p.failureReason ? `· ${p.failureReason}` : ''}
                          </p>
                        </div>
                        <StatusBadge status={p.status} label={paymentStatusLabel[p.status] ?? p.status} />
                        {hasPermission(user, 'payment:refund') && ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status) ? (
                          <div className="button-row">
                            <input className="input" aria-label="Refund reason" placeholder="Refund reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                            <Button size="sm" variant="danger-outline" disabled={refundReason.trim().length < 3} onClick={() => refund.mutate(p.id)}>
                              Refund
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No payments yet.</p>
                )}
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
