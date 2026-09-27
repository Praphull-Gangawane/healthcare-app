import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../../api/privacy';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatDateTime } from '../../utils/format';

export function AdminAudit() {
  const [action, setAction] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [page, setPage] = useState(1);
  const a = useDebouncedValue(action, 300);
  const r = useDebouncedValue(resourceId, 300);
  const q = useQuery({ queryKey: ['audit', a, r, page], queryFn: () => auditApi.list({ ...(a ? { action: a } : {}), ...(r ? { resourceId: r } : {}), page }) });
  return (
    <div className="page stack">
      <PageHeader title="Audit log" subtitle="Append-only record of sign-ins, record access and changes." docTitle="Audit log" />
      <div className="form-grid card">
        <div className="field">
          <label htmlFor="au-action">Action starts with</label>
          <input id="au-action" className="input" placeholder="e.g. prescription." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label htmlFor="au-res">Resource ID</label>
          <input id="au-res" className="input" value={resourceId} onChange={(e) => { setResourceId(e.target.value); setPage(1); }} />
        </div>
      </div>
      <QueryState query={q}>
        {(d) => (
          <>
            <DataTable
              caption="Audit entries"
              rows={d.items}
              rowKey={(x) => x.id}
              rowTestId="audit-row"
              columns={[
                { key: 't', header: 'Time', rowHeader: true, render: (x) => formatDateTime(x.createdAt) },
                { key: 'a', header: 'Actor', render: (x) => (x.actor ? `${x.actor.displayName} (${x.actorRoles.join(', ')})` : 'System') },
                { key: 'x', header: 'Action', render: (x) => <span className="mono">{x.action}</span> },
                { key: 'r', header: 'Resource', render: (x) => `${x.resourceType}${x.resourceId ? ` · ${x.resourceId.slice(0, 12)}…` : ''}` },
                { key: 'o', header: 'Outcome', render: (x) => <StatusBadge status={x.outcome} label={x.outcome.toLowerCase()} tone={x.outcome === 'SUCCESS' ? 'success' : x.outcome === 'DENIED' ? 'warning' : 'error'} /> },
                { key: 'w', header: 'Reason', render: (x) => x.reason ?? '—' },
              ]}
            />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  );
}
