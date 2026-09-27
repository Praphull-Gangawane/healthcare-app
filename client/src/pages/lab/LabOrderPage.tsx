import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { investigationsApi, type ResultInput } from '../../api/investigations';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FileUpload } from '../../components/FileUpload';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import type { InvestigationOrder, InvestigationStatus } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { investigationStatusStaffLabel, priorityLabel } from '../../utils/labels';
import { LabResultsTable } from '../portal/MyReports';

function ResultForm({ order, onSaved }: { order: InvestigationOrder; onSaved: () => void }) {
  const toast = useToast();
  const initial = (o: InvestigationOrder) =>
    Object.fromEntries(
      o.investigation.parameters.map((p) => {
        const r = o.results.find((x) => x.parameterCode === p.code);
        return [p.code, { v: r ? String(r.valueNumeric ?? r.valueText ?? '') : '', abnormal: r?.abnormalFlag === 'ABNORMAL' }];
      }),
    ) as Record<string, { v: string; abnormal: boolean }>;
  const [values, setValues] = useState(() => initial(order));
  const [seenOrder, setSeenOrder] = useState(order);
  if (seenOrder !== order) {
    setSeenOrder(order);
    setValues(initial(order));
  }
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const results: ResultInput[] = order.investigation.parameters
        .filter((p) => values[p.code]?.v.trim())
        .map((p) => {
          const raw = values[p.code]?.v.trim() ?? '';
          const numeric = p.unit !== undefined && raw !== '' && !Number.isNaN(Number(raw));
          return { parameterCode: p.code, ...(numeric ? { valueNumeric: Number(raw) } : { valueText: raw }), ...(values[p.code]?.abnormal ? { abnormal: true } : {}) };
        });
      return investigationsApi.enterResults(order.id, results, order.status === 'VERIFIED' ? reason : undefined);
    },
    onSuccess: () => {
      toast.success('Results saved.');
      onSaved();
    },
  });
  return (
    <form className="card stack-sm" aria-labelledby="res-h" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h2 id="res-h">Enter results</h2>
      {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table (scrollable)">
        <table className="table">
          <caption className="visually-hidden">Result entry</caption>
          <thead>
            <tr>
              <th scope="col">Parameter</th>
              <th scope="col">Value</th>
              <th scope="col">Unit</th>
              <th scope="col">Reference</th>
              <th scope="col">Abnormal</th>
            </tr>
          </thead>
          <tbody>
            {order.investigation.parameters.map((p) => (
              <tr key={p.code}>
                <th scope="row">
                  <label htmlFor={`res-${p.code}`}>{p.name}</label>
                </th>
                <td>
                  <input id={`res-${p.code}`} className="input" value={values[p.code]?.v ?? ''} onChange={(e) => setValues({ ...values, [p.code]: { v: e.target.value, abnormal: values[p.code]?.abnormal ?? false } })} />
                </td>
                <td>{p.unit ?? '—'}</td>
                <td>{p.refLow !== undefined || p.refHigh !== undefined ? `${p.refLow ?? ''} – ${p.refHigh ?? ''}` : (p.refText ?? '—')}</td>
                <td>
                  <input type="checkbox" aria-label={`${p.name} abnormal`} checked={values[p.code]?.abnormal ?? false} onChange={(e) => setValues({ ...values, [p.code]: { v: values[p.code]?.v ?? '', abnormal: e.target.checked } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.status === 'VERIFIED' ? (
        <div className="field">
          <label htmlFor="corr-reason">Correction reason (required after verification)</label>
          <input id="corr-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      <div>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save results
        </Button>
      </div>
    </form>
  );
}

export function LabOrderPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['lab-order', id], queryFn: () => investigationsApi.order(id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['lab-order', id] });
    void qc.invalidateQueries({ queryKey: ['worklist'] });
  };
  const status = useMutation({ mutationFn: (s: InvestigationStatus) => investigationsApi.setStatus(id, s), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const verify = useMutation({ mutationFn: () => investigationsApi.verify(id), onSuccess: () => { toast.success('Report verified and released to the patient.'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const upload = useMutation({ mutationFn: (f: File) => investigationsApi.uploadReport(id, f), onSuccess: () => { toast.success('Report file attached.'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <QueryState query={q}>
        {(o) => (
          <>
            <PageHeader title={`${o.investigation.name} · ${o.orderNumber}`} subtitle={`${o.patient.fullName} · ${o.patient.uhid}${o.patient.age !== undefined ? ` · ${o.patient.age} y` : ''}`} back={{ to: '/lab', label: 'Worklist' }} docTitle={o.orderNumber} />
            <section className="card stack-sm">
              <div className="button-row">
                <StatusBadge status={o.status} label={investigationStatusStaffLabel[o.status]} />
                <StatusBadge status={o.priority} label={priorityLabel[o.priority]} tone={o.priority === 'ROUTINE' ? 'neutral' : 'warning'} />
              </div>
              <p className="small">
                Ordered by {o.doctor.displayName} · {formatDateTime(o.createdAt)} {o.investigation.sampleType ? `· Sample: ${o.investigation.sampleType}` : ''}
              </p>
              {o.clinicalNotes ? <p>Notes for lab: {o.clinicalNotes}</p> : null}
              <div className="button-row">
                {['ORDERED', 'SCHEDULED'].includes(o.status) ? (
                  <Button variant="primary" loading={status.isPending} onClick={() => status.mutate('COLLECTED')}>
                    Mark sample collected
                  </Button>
                ) : null}
                {o.status === 'COLLECTED' ? (
                  <Button variant="secondary" loading={status.isPending} onClick={() => status.mutate('PROCESSING')}>
                    Start processing
                  </Button>
                ) : null}
                {o.status === 'COMPLETED' ? (
                  <Button variant="primary" icon="shieldCheck" loading={verify.isPending} onClick={() => verify.mutate()}>
                    Verify report
                  </Button>
                ) : null}
              </div>
            </section>
            {o.results.length ? (
              <section className="card stack-sm">
                <h2>Current results</h2>
                <LabResultsTable order={o} />
              </section>
            ) : null}
            {['COLLECTED', 'PROCESSING', 'COMPLETED', 'VERIFIED'].includes(o.status) ? <ResultForm order={o} onSaved={refresh} /> : null}
            <section className="card stack-sm">
              <h2>Report file</h2>
              {o.report?.documentId ? <p className="small">A report file is attached.</p> : null}
              <FileUpload label="Attach report (PDF or image)" withTitle={false} busy={upload.isPending} onUpload={(f) => upload.mutateAsync(f).then(() => undefined)} />
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
