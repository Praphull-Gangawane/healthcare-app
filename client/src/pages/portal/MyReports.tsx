import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { investigationsApi } from '../../api/investigations';
import { useDocumentOpener } from '../../components/MedicalDocumentViewer';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PatientPicker } from '../../components/PatientPicker';
import { QueryState } from '../../components/QueryState';
import { TrendChart } from '../../components/TrendChart';
import { usePortalPatients } from '../../hooks/usePortalPatients';
import type { InvestigationOrder } from '../../types/domain';
import { formatDate, formatNumber } from '../../utils/format';
import { abnormalFlagLabel } from '../../utils/labels';

export function LabResultsTable({ order }: { order: InvestigationOrder }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Table (scrollable)">
      <table className="table">
        <caption className="visually-hidden">{order.investigation.name} results</caption>
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Result</th>
            <th scope="col">Reference range</th>
            <th scope="col">Flag</th>
          </tr>
        </thead>
        <tbody>
          {order.results.map((r) => (
            <tr key={r.id} data-testid="lab-result-row" data-flag={r.abnormalFlag}>
              <th scope="row">{r.parameterName}</th>
              <td>
                {r.valueNumeric !== null ? formatNumber(r.valueNumeric, 2) : r.valueText} {r.unit ?? ''}
              </td>
              <td>{r.refLow !== null || r.refHigh !== null ? `${r.refLow ?? ''} – ${r.refHigh ?? ''}` : (r.refText ?? '—')}</td>
              <td>{r.abnormalFlag === 'NOT_APPLICABLE' ? '—' : abnormalFlagLabel[r.abnormalFlag]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParameterTrend({ patientId, code, name }: { patientId: string; code: string; name: string }) {
  const q = useQuery({ queryKey: ['lab-trend', patientId, code], queryFn: () => investigationsApi.trend(patientId, code) });
  if (!q.data || q.data.length < 2) return null;
  const first = q.data[0];
  return <TrendChart title={name} unit={first?.unit ?? ''} points={q.data.map((p) => ({ date: p.date, value: p.value }))} refLow={first?.refLow} refHigh={first?.refHigh} />;
}

export function MyReports() {
  const { options, patientId, setPatientId } = usePortalPatients();
  const [trendFor, setTrendFor] = useState<string | null>(null);
  const opener = useDocumentOpener();
  const q = useQuery({ queryKey: ['reports', patientId], queryFn: () => investigationsApi.listForPatient(patientId ?? ''), enabled: !!patientId });
  return (
    <div className="page stack">
      <PageHeader title="Test reports" subtitle="Reports appear here once the lab has verified them." docTitle="Test reports" />
      <PatientPicker options={options} value={patientId} onChange={setPatientId} />
      <p className="small muted">Values outside the reference range are marked for your information only. Please discuss your results with your doctor.</p>
      <QueryState query={q} isEmpty={(d) => !d.length} emptyTitle="No reports yet">
        {(orders) => (
          <div className="stack">
            {orders.map((o) => (
              <section key={o.id} className="card stack-sm" aria-labelledby={`rep-${o.id}`}>
                <div className="card-header">
                  <h2 id={`rep-${o.id}`}>{o.investigation.name}</h2>
                  <span className="small muted">
                    {formatDate(o.verifiedAt ?? o.createdAt)} · {o.orderNumber}
                  </span>
                </div>
                <LabResultsTable order={o} />
                {o.doctorComment ? <p className="small">Doctor’s note: {o.doctorComment}</p> : null}
                <div className="button-row">
                  {o.report?.documentId ? (
                    <Button size="sm" variant="secondary" icon="file" onClick={() => void opener.open(o.report?.documentId as string, `${o.investigation.name} report`)}>
                      View report file
                    </Button>
                  ) : null}
                  {o.results.some((r) => r.valueNumeric !== null) ? (
                    <Button size="sm" variant="ghost" icon="chart" aria-expanded={trendFor === o.id} onClick={() => setTrendFor(trendFor === o.id ? null : o.id)}>
                      Show trend
                    </Button>
                  ) : null}
                </div>
                {trendFor === o.id && patientId ? o.results.filter((r) => r.valueNumeric !== null).map((r) => <ParameterTrend key={r.parameterCode} patientId={patientId} code={r.parameterCode} name={r.parameterName} />) : null}
              </section>
            ))}
          </div>
        )}
      </QueryState>
      {opener.viewer}
    </div>
  );
}
