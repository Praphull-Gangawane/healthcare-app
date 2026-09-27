import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import type { ReferenceRange } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { vitalTypeLabel } from '../../utils/labels';

function Row({ r }: { r: ReferenceRange }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [low, setLow] = useState(String(r.low));
  const [high, setHigh] = useState(String(r.high));
  const save = useMutation({ mutationFn: () => adminApi.upsertReferenceRange({ id: r.id, type: r.type, ageMinYears: r.ageMinYears, ageMaxYears: r.ageMaxYears, low: Number(low), high: Number(high), ...(r.urgentLow ? { urgentLow: Number(r.urgentLow) } : {}), ...(r.urgentHigh ? { urgentHigh: Number(r.urgentHigh) } : {}), ...(r.low2 ? { low2: Number(r.low2) } : {}), ...(r.high2 ? { high2: Number(r.high2) } : {}), unit: r.unit }), onSuccess: () => { toast.success('Range updated.'); void qc.invalidateQueries({ queryKey: ['ranges'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <tr>
      <th scope="row">{vitalTypeLabel[r.type]}</th>
      <td>
        {r.ageMinYears}–{r.ageMaxYears} y
      </td>
      <td>
        <input className="input" aria-label={`${vitalTypeLabel[r.type]} low (${r.ageMinYears}-${r.ageMaxYears} y)`} value={low} onChange={(e) => setLow(e.target.value)} />
      </td>
      <td>
        <input className="input" aria-label={`${vitalTypeLabel[r.type]} high (${r.ageMinYears}-${r.ageMaxYears} y)`} value={high} onChange={(e) => setHigh(e.target.value)} />
      </td>
      <td>{r.urgentLow ?? '—'} / {r.urgentHigh ?? '—'}</td>
      <td>{r.unit}</td>
      <td>
        <Button size="sm" variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </td>
    </tr>
  );
}

export function AdminReferenceRanges() {
  const q = useQuery({ queryKey: ['ranges'], queryFn: adminApi.referenceRanges, retry: false });
  return (
    <div className="page stack">
      <PageHeader title="Vital reference ranges" docTitle="Reference ranges" />
      <Alert tone="warning" title="Clinical governance" live={false}>
        Values are demo defaults and must be reviewed by your clinicians. They only flag measurements for professional review — the system never diagnoses. Editing requires a clinician role.
      </Alert>
      <QueryState query={q}>
        {(rows) => (
          <div className="table-wrap card" tabIndex={0} role="region" aria-label="Table (scrollable)">
            <table className="table">
              <caption className="visually-hidden">Reference ranges</caption>
              <thead>
                <tr>
                  <th scope="col">Measurement</th>
                  <th scope="col">Age</th>
                  <th scope="col">Low</th>
                  <th scope="col">High</th>
                  <th scope="col">Urgent low / high</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </div>
  );
}
