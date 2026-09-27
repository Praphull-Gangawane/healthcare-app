import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { privacyApi } from '../../api/privacy';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { privacyStatusLabel, privacyTypeLabel } from '../../utils/labels';

export function AdminPrivacy() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['privacy', 'all'], queryFn: privacyApi.list });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const resolve = useMutation({ mutationFn: ({ id, status }: { id: string; status: 'IN_REVIEW' | 'COMPLETED' | 'REJECTED' }) => privacyApi.resolve(id, status, notes[id] ?? ''), onSuccess: () => { toast.success('Request updated.'); void qc.invalidateQueries({ queryKey: ['privacy'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <PageHeader title="Privacy requests" docTitle="Privacy requests" />
      <Alert tone="info" live={false}>
        Erasure of medical records requires legal review against retention obligations and cannot be completed automatically.
      </Alert>
      <QueryState query={q} isEmpty={(d) => !d.length} emptyTitle="No requests">
        {(list) => (
          <ul className="stack-sm">
            {list.map((r) => (
              <li key={r.id} className="card stack-sm">
                <p className="list-item-title">
                  {privacyTypeLabel[r.type] ?? r.type} · {r.patient?.fullName} ({r.patient?.uhid})
                </p>
                <p className="small muted">
                  {formatDateTime(r.createdAt)} {r.details ? `· ${r.details}` : ''}
                </p>
                <StatusBadge status={r.status} label={privacyStatusLabel[r.status] ?? r.status} />
                {['RECEIVED', 'IN_REVIEW'].includes(r.status) ? (
                  <>
                    <div className="field">
                      <label htmlFor={`pr-${r.id}`}>Resolution note</label>
                      <input id={`pr-${r.id}`} className="input" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                    </div>
                    <div className="button-row">
                      <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, status: 'IN_REVIEW' })}>
                        Mark in review
                      </Button>
                      <Button size="sm" variant="primary" disabled={(notes[r.id] ?? '').length < 3} onClick={() => resolve.mutate({ id: r.id, status: 'COMPLETED' })}>
                        Complete
                      </Button>
                      <Button size="sm" variant="danger-outline" disabled={(notes[r.id] ?? '').length < 3} onClick={() => resolve.mutate({ id: r.id, status: 'REJECTED' })}>
                        Reject
                      </Button>
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
