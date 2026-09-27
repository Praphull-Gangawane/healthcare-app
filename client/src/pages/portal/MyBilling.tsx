import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '../../api/billing';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';
import { formatDate, formatMoney } from '../../utils/format';
import { invoiceStatusLabel } from '../../utils/labels';

export function MyBilling() {
  const qc = useQueryClient();
  const toast = useToast();
  const idem = useIdempotencyKey();
  const q = useQuery({ queryKey: ['invoices', 'mine'], queryFn: () => billingApi.invoices({}) });
  const pay = useMutation({
    mutationFn: (id: string) => idem.run(`pay:${id}`, (k) => billingApi.pay(id, 'UPI', k)),
    onSuccess: () => {
      toast.success('Payment received. Thank you.');
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="page stack">
      <PageHeader title="Bills & payments" subtitle="Payments here use a demo payment provider — no money is charged." docTitle="Bills & payments" />
      <QueryState query={q} isEmpty={(d) => !d.items.length} emptyTitle="No bills yet">
        {(d) => (
          <ul className="list">
            {d.items.map((inv) => {
              const due = Number(inv.total) - Number(inv.amountPaid);
              return (
                <li key={inv.id} className="list-item" data-testid="invoice-row">
                  <div className="list-item-main">
                    <p className="list-item-title">
                      {inv.invoiceNumber} · {formatMoney(inv.total)}
                    </p>
                    <p className="list-item-meta">
                      {formatDate(inv.issuedAt ?? inv.createdAt)} · {inv.facility.name} · {inv.items.map((i) => i.description).join(', ')}
                    </p>
                  </div>
                  <StatusBadge status={inv.status} label={invoiceStatusLabel[inv.status] ?? inv.status} />
                  {due > 0 && ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status) ? (
                    <Button size="sm" variant="primary" loading={pay.isPending && pay.variables === inv.id} onClick={() => pay.mutate(inv.id)}>
                      Pay {formatMoney(due.toFixed(2))} (UPI demo)
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
