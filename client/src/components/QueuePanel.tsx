import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queueApi } from '../api/queue';
import type { QueueTokenRow } from '../types/domain';
import { useToast } from '../hooks/useToast';
import { errorMessage } from '../utils/errors';
import { formatTime } from '../utils/format';
import { tokenStatusLabel } from '../utils/labels';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { QueryState } from './QueryState';
import { StatusBadge } from './StatusBadge';

/** Live queue for one doctor at one facility. `manage` enables front-desk controls. */
export function QueuePanel({ doctorId, facilityId, manage = false, doctors, onOpen }: { doctorId: string; facilityId: string; manage?: boolean; doctors?: { id: string; displayName: string }[]; onOpen?: (t: QueueTokenRow) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['queue', doctorId, facilityId], queryFn: () => queueApi.view(doctorId, facilityId), refetchInterval: 15_000 });
  const act = useMutation({
    mutationFn: async ({ kind, token, target }: { kind: 'next' | 'recall' | 'skip' | 'requeue' | 'absent' | 'transfer'; token?: QueueTokenRow; target?: string }) => {
      const queueId = query.data?.queue?.id;
      if (kind === 'next' && queueId) return queueApi.callNext(queueId);
      if (!token) return null;
      if (kind === 'transfer' && target) return queueApi.transfer(token.id, target);
      if (kind === 'recall') return queueApi.recall(token.id);
      if (kind === 'skip') return queueApi.skip(token.id);
      if (kind === 'requeue') return queueApi.requeue(token.id);
      return queueApi.absent(token.id);
    },
    onSuccess: (res, v) => {
      if (v.kind === 'next' && res) toast.success(`Token ${res.tokenNumber} called.`);
      void qc.invalidateQueries({ queryKey: ['queue'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <QueryState query={query}>
      {(q) =>
        !q.queue ? (
          <EmptyState icon="queue" title="No queue yet today" message="The queue starts when the first patient checks in." />
        ) : (
          <section className="queue-view stack-sm" aria-label={`Queue for ${q.queue.doctor}`}>
            <div className="stat-grid">
              <div className="stat">
                <p className="stat-label">Now serving</p>
                <p className="stat-value" data-testid="now-serving">
                  {q.nowServing ? `Token ${q.nowServing.tokenNumber}` : '—'}
                </p>
              </div>
              <div className="stat">
                <p className="stat-label">Next patient</p>
                <p className="stat-value">{q.next ? `Token ${q.next.tokenNumber}` : '—'}</p>
              </div>
              <div className="stat">
                <p className="stat-label">Waiting</p>
                <p className="stat-value" data-testid="waiting-count">
                  {q.waitingCount}
                </p>
              </div>
              <div className="stat">
                <p className="stat-label">Average wait</p>
                <p className="stat-value">{q.avgWaitMinutes != null ? `${q.avgWaitMinutes} min` : '—'}</p>
              </div>
            </div>
            <div className="button-row">
              <Button variant="primary" icon="bell" disabled={!q.next} loading={act.isPending && act.variables?.kind === 'next'} onClick={() => act.mutate({ kind: 'next' })}>
                Call next patient
              </Button>
              <Link className="btn btn-ghost btn-sm" to={`/queue-display/${q.queue.id}`} target="_blank" rel="noopener">
                Open public display
              </Link>
            </div>
            <ul className="list" aria-label="Tokens">
              {q.tokens.map((t) => (
                <li key={t.id} className="list-item" data-testid="queue-token" data-token={t.tokenNumber} data-status={t.status}>
                  <span className="queue-token" aria-hidden="true">
                    {t.tokenNumber}
                  </span>
                  <div className="list-item-main">
                    <p className="list-item-title">
                      Token {t.tokenNumber} · {t.patient.fullName}
                    </p>
                    <p className="list-item-meta">
                      {t.appointment?.isWalkIn ? 'Walk-in' : t.appointment ? `Booked ${formatTime(t.appointment.startAt)}` : ''} {t.priority > 0 ? '· Priority' : ''} · checked in {formatTime(t.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={t.status} label={tokenStatusLabel[t.status]} />
                  <div className="button-row">
                    {onOpen && t.appointment ? (
                      <Button size="sm" variant="secondary" onClick={() => onOpen(t)}>
                        Open
                      </Button>
                    ) : null}
                    {manage && ['CALLED', 'SKIPPED'].includes(t.status) ? (
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ kind: 'recall', token: t })} aria-label={`Re-call token ${t.tokenNumber}`}>
                        Re-call
                      </Button>
                    ) : null}
                    {manage && ['WAITING', 'CALLED'].includes(t.status) ? (
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ kind: 'skip', token: t })} aria-label={`Skip token ${t.tokenNumber}`}>
                        Skip
                      </Button>
                    ) : null}
                    {manage && t.status === 'SKIPPED' ? (
                      <Button size="sm" variant="ghost" onClick={() => act.mutate({ kind: 'requeue', token: t })} aria-label={`Return token ${t.tokenNumber} to queue`}>
                        Return to queue
                      </Button>
                    ) : null}
                    {manage && ['WAITING', 'CALLED', 'SKIPPED'].includes(t.status) ? (
                      <Button size="sm" variant="danger-outline" onClick={() => act.mutate({ kind: 'absent', token: t })} aria-label={`Mark token ${t.tokenNumber} absent`}>
                        Absent
                      </Button>
                    ) : null}
                    {manage && doctors && ['WAITING', 'SKIPPED', 'CALLED'].includes(t.status) ? (
                      <select className="select" aria-label={`Move token ${t.tokenNumber} to another doctor`} value="" onChange={(e) => e.target.value && act.mutate({ kind: 'transfer', token: t, target: e.target.value })}>
                        <option value="">Move to…</option>
                        {doctors
                          .filter((d) => d.id !== doctorId)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.displayName}
                            </option>
                          ))}
                      </select>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      }
    </QueryState>
  );
}
