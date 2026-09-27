import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi } from '../../api/dashboards';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { formatMoney, todayIso } from '../../utils/format';
import { DateRange } from '../billing/RevenuePage';

function Bars({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card stack-sm" aria-labelledby={`b-${title}`}>
      <h2 id={`b-${title}`}>{title}</h2>
      {rows.length ? (
        <ul className="stack-sm">
          {rows
            .sort((a, b) => b.value - a.value)
            .map((r) => (
              <li key={r.name} className="bar">
                <span className="small">{r.name}</span>
                <span className="bar-track" aria-hidden="true">
                  <span style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
                <span className="small">{r.value}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="muted">No data for this period.</p>
      )}
    </section>
  );
}

export function AdminDashboardPage() {
  const [range, setRange] = useState({ from: todayIso(), to: todayIso() });
  const q = useQuery({ queryKey: ['dashboard', 'admin', range], queryFn: () => dashboardsApi.admin(range.from, range.to) });
  return (
    <div className="page stack">
      <PageHeader title="Operations overview" subtitle="Operational figures only — clinical records are not shown here." docTitle="Admin overview" />
      <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      <QueryState query={q}>
        {(d) => (
          <>
            <div className="stat-grid">
              {[
                ['Appointments', d.appointments],
                ['Completed consultations', d.completed],
                ['Cancelled', d.cancelled],
                ['No-shows', d.noShows],
                ['Average waiting time', d.averageWaitMinutes != null ? `${d.averageWaitMinutes} min` : '—'],
                ['Patient registrations', d.registrations],
                ['Revenue', formatMoney(d.revenue)],
                ['Pending payments', `${formatMoney(d.pendingPayments)} (${d.pendingInvoices})`],
              ].map(([l, v]) => (
                <div key={String(l)} className="stat">
                  <p className="stat-label">{l}</p>
                  <p className="stat-value">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid-2">
              <Bars title="Doctor utilization (appointments)" rows={d.doctorUtilization.map((x) => ({ name: x.name, value: x.appointments }))} />
              <Bars title="Department utilization (appointments)" rows={d.departmentUtilization.map((x) => ({ name: x.name, value: x.appointments }))} />
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
