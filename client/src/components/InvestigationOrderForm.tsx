import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { investigationsApi } from '../api/investigations';
import type { OrderPriority } from '../types/domain';
import { Button } from './Button';

export function InvestigationOrderForm({ onOrder, busy, error }: { onOrder: (input: { investigationId: string; priority: OrderPriority; clinicalNotes?: string }) => Promise<unknown>; busy?: boolean; error?: string | null }) {
  const catalog = useQuery({ queryKey: ['investigation-catalog'], queryFn: () => investigationsApi.catalog(), staleTime: 10 * 60_000 });
  const [investigationId, setId] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('ROUTINE');
  const [notes, setNotes] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  return (
    <form
      className="stack-sm"
      data-testid="order-form"
      aria-label="Order investigation"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!investigationId) return setLocal('Choose a test to order.');
        setLocal(null);
        try {
          await onOrder({ investigationId, priority, ...(notes.trim() ? { clinicalNotes: notes.trim() } : {}) });
          setId('');
          setNotes('');
          setPriority('ROUTINE');
        } catch {
          /* parent shows error */
        }
      }}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="inv-test">Test</label>
          <select id="inv-test" className="select" value={investigationId} onChange={(e) => setId(e.target.value)}>
            <option value="">Select a test…</option>
            {catalog.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="inv-priority">Priority</label>
          <select id="inv-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as OrderPriority)}>
            <option value="ROUTINE">Routine</option>
            <option value="URGENT">Urgent</option>
            <option value="STAT">STAT</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="inv-notes">Notes for the lab (optional)</label>
          <input id="inv-notes" className="input" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {local || error ? (
        <p className="field-error" role="alert">
          {local ?? error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" icon="flask" loading={busy} loadingText="Ordering…">
          Order test
        </Button>
      </div>
    </form>
  );
}
