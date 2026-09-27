import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { billingApi } from '../../api/billing';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, formatMoney } from '../../utils/format';
import { invoiceStatusLabel } from '../../utils/labels';

export function InvoicesPage() {
  const base = useLocation().pathname.startsWith('/reception') ? '/reception/invoices' : '/billing/invoices';
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['invoices', status, page], queryFn: () => billingApi.invoices({ ...(status ? { status } : {}), page }) });
  return (
    <div className="page stack">
      <PageHeader title="Invoices" docTitle="Invoices" />
      <div className="field card" style={{ maxWidth: 320 }}>
        <label htmlFor="inv-status">Status</label>
        <select id="inv-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All</option>
          {Object.entries(invoiceStatusLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <QueryState query={q}>
        {(d) => (
          <>
            <DataTable
              caption="Invoices"
              rows={d.items}
              rowKey={(r) => r.id}
              rowTestId="invoice-row"
              columns={[
                { key: 'no', header: 'Invoice', rowHeader: true, render: (r) => <Link to={`${base}/${r.id}`}>{r.invoiceNumber}</Link> },
                { key: 'date', header: 'Date', render: (r) => formatDate(r.issuedAt ?? r.createdAt) },
                { key: 'patient', header: 'Patient', render: (r) => `${r.patient.fullName} (${r.patient.uhid})` },
                { key: 'total', header: 'Total', numeric: true, render: (r) => formatMoney(r.total) },
                { key: 'paid', header: 'Paid', numeric: true, render: (r) => formatMoney(r.amountPaid) },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={invoiceStatusLabel[r.status] ?? r.status} /> },
              ]}
            />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  );
}
