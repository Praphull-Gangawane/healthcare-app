import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/reports';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { addDaysIso, formatMoney, todayIso } from '../../utils/format';

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="form-grid card">
      <div className="field">
        <label htmlFor="dr-from">From</label>
        <input id="dr-from" type="date" className="input" value={from} onChange={(e) => onChange(e.target.value, to)} />
      </div>
      <div className="field">
        <label htmlFor="dr-to">To</label>
        <input id="dr-to" type="date" className="input" value={to} onChange={(e) => onChange(from, e.target.value)} />
      </div>
    </div>
  );
}

export function RevenuePage() {
  const [range, setRange] = useState({ from: addDaysIso(todayIso(), -30), to: todayIso() });
  const q = useQuery({ queryKey: ['revenue', range], queryFn: () => reportsApi.revenue(range) });
  return (
    <div className="page stack">
      <PageHeader title="Revenue report" docTitle="Revenue report" />
      <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      <QueryState query={q}>
        {(r) => (
          <div className="stat-grid">
            <div className="stat">
              <p className="stat-label">Consultation revenue</p>
              <p className="stat-value">{formatMoney(r.consultationRevenue)}</p>
            </div>
            <div className="stat">
              <p className="stat-label">Service revenue</p>
              <p className="stat-value">{formatMoney(r.serviceRevenue)}</p>
            </div>
            <div className="stat">
              <p className="stat-label">Refunds</p>
              <p className="stat-value">{formatMoney(r.refunds)}</p>
            </div>
            {Object.entries(r.collectedByMethod).map(([m, v]) => (
              <div className="stat" key={m}>
                <p className="stat-label">Collected · {m}</p>
                <p className="stat-value">{formatMoney(v)}</p>
              </div>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
