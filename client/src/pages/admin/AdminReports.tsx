import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/reports';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import { saveBlob } from '../../utils/download';
import { errorMessage } from '../../utils/errors';
import { addDaysIso, formatDateTime, formatMoney, todayIso } from '../../utils/format';
import { appointmentStatusLabel } from '../../utils/labels';
import { DateRange } from '../billing/RevenuePage';

type Kind = 'appointments' | 'doctors' | 'patients' | 'revenue';

export function AdminReports() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('appointments');
  const [range, setRange] = useState({ from: addDaysIso(todayIso(), -30), to: todayIso() });
  const [status, setStatus] = useState('');
  const f = { ...range, ...(status ? { status } : {}) };
  const appts = useQuery({ queryKey: ['report', 'appointments', f], queryFn: () => reportsApi.appointments(f), enabled: kind === 'appointments' });
  const doctors = useQuery({ queryKey: ['report', 'doctors', f], queryFn: () => reportsApi.doctors(f), enabled: kind === 'doctors' });
  const patients = useQuery({ queryKey: ['report', 'patients', f], queryFn: () => reportsApi.patients(f), enabled: kind === 'patients' });
  const revenue = useQuery({ queryKey: ['report', 'revenue', f], queryFn: () => reportsApi.revenue(f), enabled: kind === 'revenue' });
  async function exportCsv(k: 'appointments' | 'doctors') {
    try {
      const file = await reportsApi.csv(k, f);
      saveBlob(file.blob, file.filename ?? `${k}.csv`);
      toast.success('Export downloaded. Exports are recorded in the audit trail.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <div className="page stack">
      <PageHeader title="Reports" docTitle="Reports" />
      <div className="tabs" role="tablist" aria-label="Report">
        {(['appointments', 'doctors', 'patients', 'revenue'] as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {k[0]?.toUpperCase()}
            {k.slice(1)}
          </button>
        ))}
      </div>
      <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      {kind === 'appointments' ? (
        <>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="rep-status">Status</label>
              <select id="rep-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {Object.entries(appointmentStatusLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" icon="download" onClick={() => void exportCsv('appointments')}>
              Export CSV
            </Button>
          </div>
          <QueryState query={appts}>
            {(r) => (
              <>
                <p className="small">{Object.entries(r.summary).map(([k, v]) => `${appointmentStatusLabel[k as keyof typeof appointmentStatusLabel] ?? k}: ${v}`).join(' · ')}</p>
                <DataTable caption="Appointments" rows={r.rows.slice(0, 200)} rowKey={(x) => x.appointmentNumber} columns={[{ key: 'n', header: 'Appointment', rowHeader: true, render: (x) => x.appointmentNumber }, { key: 't', header: 'When', render: (x) => formatDateTime(x.startAt) }, { key: 'd', header: 'Doctor', render: (x) => x.doctor }, { key: 'dep', header: 'Department', render: (x) => x.department }, { key: 's', header: 'Status', render: (x) => x.status }, { key: 'p', header: 'Patient UHID', render: (x) => x.patientUhid }]} />
              </>
            )}
          </QueryState>
        </>
      ) : null}
      {kind === 'doctors' ? (
        <>
          <div>
            <Button variant="secondary" icon="download" onClick={() => void exportCsv('doctors')}>
              Export CSV
            </Button>
          </div>
          <QueryState query={doctors}>{(rows) => <DataTable caption="Doctor report" rows={rows} rowKey={(x) => x.doctorId} columns={[{ key: 'd', header: 'Doctor', rowHeader: true, render: (x) => x.doctor }, { key: 's', header: 'Specialty', render: (x) => x.specialty }, { key: 'a', header: 'Appointments', numeric: true, render: (x) => x.appointments }, { key: 'c', header: 'Completed', numeric: true, render: (x) => x.completed }, { key: 'x', header: 'Cancelled', numeric: true, render: (x) => x.cancelled }, { key: 'n', header: 'No-shows', numeric: true, render: (x) => x.noShows }]} />}</QueryState>
        </>
      ) : null}
      {kind === 'patients' ? (
        <QueryState query={patients}>
          {(r) => (
            <div className="stat-grid">
              <div className="stat"><p className="stat-label">New registrations</p><p className="stat-value">{r.newRegistrations}</p></div>
              <div className="stat"><p className="stat-label">New patients seen</p><p className="stat-value">{r.newPatientsSeen}</p></div>
              <div className="stat"><p className="stat-label">Returning patients seen</p><p className="stat-value">{r.returningPatientsSeen}</p></div>
            </div>
          )}
        </QueryState>
      ) : null}
      {kind === 'revenue' ? (
        <QueryState query={revenue}>
          {(r) => (
            <div className="stat-grid">
              <div className="stat"><p className="stat-label">Consultation revenue</p><p className="stat-value">{formatMoney(r.consultationRevenue)}</p></div>
              <div className="stat"><p className="stat-label">Service revenue</p><p className="stat-value">{formatMoney(r.serviceRevenue)}</p></div>
              <div className="stat"><p className="stat-label">Refunds</p><p className="stat-value">{formatMoney(r.refunds)}</p></div>
            </div>
          )}
        </QueryState>
      ) : null}
    </div>
  );
}
