import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { investigationsApi } from '../../api/investigations';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../utils/format';
import { investigationStatusStaffLabel, priorityLabel } from '../../utils/labels';

const FILTERS = [
  { value: 'ORDERED,SCHEDULED,COLLECTED,PROCESSING', label: 'To process' },
  { value: 'COMPLETED', label: 'Awaiting verification' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: '', label: 'All' },
];

export function LabWorklist() {
  const [status, setStatus] = useState(FILTERS[0]?.value ?? '');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['worklist', status, page], queryFn: () => investigationsApi.worklist(status || undefined, page), refetchInterval: 30_000 });
  return (
    <div className="page stack">
      <PageHeader title="Lab worklist" docTitle="Lab worklist" />
      <div className="chip-row" role="group" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <button key={f.label} type="button" className="chip" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }}>
            {f.label}
          </button>
        ))}
      </div>
      <QueryState query={q}>
        {(d) => (
          <>
            <DataTable
              caption="Investigation orders"
              rows={d.items}
              rowKey={(r) => r.id}
              rowTestId="worklist-row"
              emptyTitle="No orders"
              columns={[
                { key: 'order', header: 'Order', rowHeader: true, render: (r) => <Link to={`/lab/orders/${r.id}`}>{r.orderNumber}</Link> },
                { key: 'test', header: 'Test', render: (r) => r.investigation.name },
                { key: 'patient', header: 'Patient', render: (r) => `${r.patient.fullName} · ${r.patient.uhid}` },
                { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} label={priorityLabel[r.priority]} tone={r.priority === 'ROUTINE' ? 'neutral' : 'warning'} /> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} label={investigationStatusStaffLabel[r.status]} /> },
                { key: 'created', header: 'Ordered', render: (r) => formatDateTime(r.createdAt) },
              ]}
            />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  );
}
