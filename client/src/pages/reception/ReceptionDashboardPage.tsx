import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboardsApi } from '../../api/dashboards';
import { appointmentsApi } from '../../api/appointments';
import { Button, ButtonLink } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PatientSearch } from '../../components/PatientSearch';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import type { Appointment } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatTime } from '../../utils/format';
import { appointmentStatusLabel } from '../../utils/labels';

export function FrontDeskActions({ a }: { a: Appointment }) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['appointments'] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
  };
  const checkIn = useMutation({ mutationFn: () => appointmentsApi.checkIn(a.id), onSuccess: (r) => { toast.success(`${r.patient.fullName} checked in — token ${r.queueToken?.tokenNumber ?? ''}.`); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  const noShow = useMutation({ mutationFn: () => appointmentsApi.noShow(a.id), onSuccess: () => { toast.success('Marked as no-show.'); done(); }, onError: (e) => toast.error(errorMessage(e)) });
  const canCheckIn = ['BOOKED', 'CONFIRMED'].includes(a.status);
  return (
    <div className="button-row">
      {canCheckIn ? (
        <Button size="sm" variant="primary" loading={checkIn.isPending} onClick={() => checkIn.mutate()} aria-label={`Check in ${a.patient.fullName}`}>
          Check in
        </Button>
      ) : null}
      {canCheckIn && new Date(a.startAt) < new Date() ? (
        <Button size="sm" variant="ghost" loading={noShow.isPending} onClick={() => noShow.mutate()} aria-label={`Mark ${a.patient.fullName} as no-show`}>
          No-show
        </Button>
      ) : null}
    </div>
  );
}

export function AppointmentRows({ items }: { items: Appointment[] }) {
  return (
    <ul className="list">
      {items.map((a) => (
        <li key={a.id} className="list-item" data-testid="appointment-row" data-appointment-id={a.id} data-status={a.status}>
          <div className="list-item-main">
            <p className="list-item-title">
              {a.isWalkIn ? 'Walk-in' : formatTime(a.startAt)} · {a.patient.fullName}
            </p>
            <p className="list-item-meta">
              {a.doctor.displayName} · <span className="mono">{a.appointmentNumber}</span> · {a.patient.uhid}
              {a.queueToken ? ` · Token ${a.queueToken.tokenNumber}` : ''}
            </p>
          </div>
          <StatusBadge status={a.status} label={appointmentStatusLabel[a.status]} />
          <FrontDeskActions a={a} />
        </li>
      ))}
    </ul>
  );
}

export function ReceptionDashboardPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['dashboard', 'reception'], queryFn: () => dashboardsApi.reception(), refetchInterval: 30_000 });
  return (
    <div className="page stack">
      <PageHeader
        title="Front desk"
        docTitle="Front desk"
        actions={
          <>
            <ButtonLink to="/reception/register" variant="primary" icon="plus">
              Register patient
            </ButtonLink>
            <ButtonLink to="/reception/walk-in" variant="secondary">
              Walk-in
            </ButtonLink>
          </>
        }
      />
      <section className="card">
        <PatientSearch onSelect={(p) => navigate(`/reception/patients/${p.id}`)} />
      </section>
      <QueryState query={q}>
        {(d) => (
          <>
            <div className="stat-grid">
              {[
                ['Scheduled today', d.counts.scheduled],
                ['Waiting', d.counts.waiting],
                ['Walk-ins', d.counts.walkIns],
                ['New patients', d.counts.newPatients],
                ['No-shows', d.counts.noShows],
                ['Reschedules', d.counts.reschedules],
              ].map(([l, v]) => (
                <div key={String(l)} className="stat">
                  <p className="stat-label">{l}</p>
                  <p className="stat-value">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid-2">
              <section className="card stack-sm" aria-labelledby="up-h">
                <h2 id="up-h">Upcoming today</h2>
                {d.upcoming.length ? <AppointmentRows items={d.upcoming} /> : <p className="muted">No more scheduled appointments today.</p>}
              </section>
              <section className="card stack-sm" aria-labelledby="w-h">
                <h2 id="w-h">Waiting patients</h2>
                {d.waiting.length ? <AppointmentRows items={d.waiting} /> : <p className="muted">Nobody is waiting.</p>}
              </section>
            </div>
            <section className="card stack-sm" aria-labelledby="doc-h">
              <h2 id="doc-h">Available doctors today</h2>
              <ul className="list">
                {d.availableDoctors.map((doc) => (
                  <li key={doc.id} className="list-item">
                    <div className="list-item-main">
                      <p className="list-item-title">{doc.displayName}</p>
                      <p className="list-item-meta">
                        {doc.specialty} · {doc.openSlots} open slot{doc.openSlots === 1 ? '' : 's'}
                        {doc.nextSlot ? ` · next ${formatTime(doc.nextSlot)}` : ''}
                      </p>
                    </div>
                    <ButtonLink size="sm" variant="secondary" to={`/reception/book?doctorId=${doc.id}`}>
                      Book
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
