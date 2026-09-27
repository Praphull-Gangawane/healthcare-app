import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { queueApi } from '../../api/queue';
import { useConfig } from '../../hooks/useConfig';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/** Public waiting-room board: token numbers and room only — no names or medical information. */
export function QueueDisplayPage() {
  const { queueId = '' } = useParams();
  const { appName } = useConfig();
  useDocumentTitle('Queue display');
  const q = useQuery({ queryKey: ['queue-display', queueId], queryFn: () => queueApi.display(queueId), refetchInterval: 10_000 });
  return (
    <main className="queue-display" id="main-content">
      <h1>
        {appName}
        {q.data ? ` · ${q.data.doctor}${q.data.room ? ` · ${q.data.room}` : ''}` : ''}
      </h1>
      {q.data ? (
        <>
          <section className="serving" aria-live="polite" aria-label="Now serving">
            <p className="serving-label">Now serving</p>
            <p className="serving-token" data-testid="now-serving">
              {q.data.nowServing ?? '—'}
            </p>
          </section>
          <section aria-label="Up next">
            <p className="serving-label">Up next</p>
            <ul className="up-next">
              {q.data.upNext.length ? q.data.upNext.map((t) => <li key={t}>{t}</li>) : <li>—</li>}
            </ul>
          </section>
          <p className="meta">{q.data.waitingCount} waiting</p>
        </>
      ) : q.isError ? (
        <p className="meta">Queue information is unavailable right now.</p>
      ) : (
        <p className="meta">Loading…</p>
      )}
    </main>
  );
}
