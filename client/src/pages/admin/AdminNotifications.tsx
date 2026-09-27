import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/format';
import { channelLabel, notificationStatusLabel, templateLabel } from '../../utils/labels';

export function AdminNotifications() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notification-log', status, page], queryFn: () => notificationsApi.log({ ...(status ? { status } : {}), page }) });
  const retry = useMutation({ mutationFn: (id: string) => notificationsApi.retry(id), onSuccess: (r) => { toast.success(`Retry result: ${notificationStatusLabel[r.status] ?? r.status}`); void qc.invalidateQueries({ queryKey: ['notification-log'] }); } });
  return (
    <div className="page stack">
      <PageHeader title="Notification delivery log" subtitle="Message bodies are not stored — only delivery metadata." docTitle="Notification log" />
      <div className="field card" style={{ maxWidth: 300 }}>
        <label htmlFor="nl-status">Status</label>
        <select id="nl-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All</option>
          {Object.entries(notificationStatusLabel).map(([k, v]) => (
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
              caption="Notifications"
              rows={d.items}
              rowKey={(n) => n.id}
              columns={[
                { key: 't', header: 'Created', rowHeader: true, render: (n) => formatDateTime(n.createdAt) },
                { key: 'c', header: 'Channel', render: (n) => channelLabel[n.channel] ?? n.channel },
                { key: 'k', header: 'Message', render: (n) => templateLabel[n.templateKey] ?? n.templateKey },
                { key: 's', header: 'Status', render: (n) => <StatusBadge status={n.status} label={notificationStatusLabel[n.status] ?? n.status} /> },
                { key: 'a', header: 'Attempts', numeric: true, render: (n) => n.attempts },
                { key: 'e', header: 'Last error', render: (n) => n.lastError ?? '—' },
                { key: 'r', header: 'Action', render: (n) => (n.status === 'FAILED' ? <Button size="sm" variant="ghost" onClick={() => retry.mutate(n.id)}>Retry</Button> : null) },
              ]}
            />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  );
}
