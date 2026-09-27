import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '../../api/appointments';
import { billingApi } from '../../api/billing';
import { Button } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import type { Appointment } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatTime, todayIso } from '../../utils/format';
import { appointmentStatusLabel } from '../../utils/labels';
import { RescheduleDialog } from '../portal/MyAppointments';
import { FrontDeskActions } from './ReceptionDashboardPage';
import { useNavigate } from 'react-router-dom';

export function ReceptionAppointments() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const q = useQuery({ queryKey: ['appointments', 'desk', date, status, term, page], queryFn: () => appointmentsApi.list({ date, status: status || undefined, ...(term.length >= 2 ? { q: term } : {}), page, pageSize: 25 }) });
  const cancel = useMutation({ mutationFn: (a: Appointment) => appointmentsApi.cancel(a.id, 'Cancelled at front desk'), onSuccess: () => { setCancelling(null); toast.success('Appointment cancelled. The patient has been notified.'); void qc.invalidateQueries({ queryKey: ['appointments'] }); } });
  const invoice = useMutation({ mutationFn: (a: Appointment) => billingApi.invoiceForAppointment(a.id), onSuccess: (inv) => navigate(`/reception/invoices/${inv.id}`), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <PageHeader title="Appointments" docTitle="Appointments" />
      <div className="form-grid card">
        <div className="field">
          <label htmlFor="ra-date">Date</label>
          <input id="ra-date" type="date" className="input" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label htmlFor="ra-search">Search</label>
          <input id="ra-search" type="search" className="input" placeholder="Appointment no., UHID, name or mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label htmlFor="ra-status">Status</label>
          <select id="ra-status" className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {Object.entries(appointmentStatusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <QueryState query={q} isEmpty={(d) => !d.items.length} emptyTitle="No appointments for this day">
        {(d) => (
          <>
            <ul className="list">
              {d.items.map((a) => (
                <li key={a.id} className="list-item" data-testid="appointment-row" data-appointment-id={a.id} data-status={a.status}>
                  <div className="list-item-main">
                    <p className="list-item-title">
                      {a.isWalkIn ? 'Walk-in' : formatTime(a.startAt)} · {a.patient.fullName}
                    </p>
                    <p className="list-item-meta">
                      {a.doctor.displayName} · <span className="mono">{a.appointmentNumber}</span>
                      {a.queueToken ? ` · Token ${a.queueToken.tokenNumber}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={a.status} label={appointmentStatusLabel[a.status]} />
                  <FrontDeskActions a={a} />
                  <div className="button-row">
                    {['BOOKED', 'CONFIRMED'].includes(a.status) ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setRescheduling(a)}>
                          Reschedule
                        </Button>
                        <Button size="sm" variant="danger-outline" onClick={() => setCancelling(a)}>
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    {!['CANCELLED', 'RESCHEDULED', 'HELD'].includes(a.status) ? (
                      <Button size="sm" variant="ghost" icon="wallet" onClick={() => invoice.mutate(a)}>
                        Invoice
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
      <ConfirmationDialog open={!!cancelling} title="Cancel appointment?" message={cancelling ? `${cancelling.patient.fullName} with ${cancelling.doctor.displayName} at ${formatTime(cancelling.startAt)}` : ''} confirmLabel="Cancel appointment" cancelLabel="Keep" tone="danger" loading={cancel.isPending} error={cancel.error ? errorMessage(cancel.error) : null} onConfirm={() => cancelling && cancel.mutate(cancelling)} onCancel={() => setCancelling(null)} />
      {rescheduling ? <RescheduleDialog appt={rescheduling} onClose={() => setRescheduling(null)} /> : null}
    </div>
  );
}
