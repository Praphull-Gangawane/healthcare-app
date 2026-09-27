import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardsApi } from '../../api/dashboards';
import { encountersApi } from '../../api/clinical';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { QueuePanel } from '../../components/QueuePanel';
import { StatusBadge } from '../../components/StatusBadge';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { useToast } from '../../hooks/useToast';
import type { Appointment } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatDateLong, formatDateOnly, formatTime } from '../../utils/format';
import { appointmentStatusLabel, appointmentTypeLabel } from '../../utils/labels';

export function useStartConsultation() {
  const navigate = useNavigate();
  const toast = useToast();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: (a: Appointment) => (a.encounter ? Promise.resolve({ id: a.encounter.id }) : idem.run(`start:${a.id}`, (k) => encountersApi.start(a.id, k))),
    onSuccess: (enc) => navigate(`/doctor/encounters/${enc.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function DoctorDashboardPage() {
  const q = useQuery({ queryKey: ['dashboard', 'doctor'], queryFn: () => dashboardsApi.doctor(), refetchInterval: 30_000 });
  const start = useStartConsultation();
  return (
    <div className="page stack">
      <QueryState query={q}>
        {(d) => {
          const facilityId = d.appointments[0]?.facilityId ?? d.current?.facilityId;
          const doctorId = d.appointments[0]?.doctorId;
          const startable = (a: Appointment) => ['CHECKED_IN', 'WAITING'].includes(a.status) || (a.type === 'TELECONSULTATION' && a.status === 'CONFIRMED') || a.status === 'IN_CONSULTATION';
          return (
            <>
              <PageHeader title="Today" subtitle={formatDateLong(`${d.date}T12:00:00+05:30`)} docTitle="Doctor dashboard" />
              <div className="stat-grid">
                {[
                  ['Appointments', d.counts.appointments],
                  ['Waiting', d.counts.waiting],
                  ['Completed', d.counts.completed],
                  ['Follow-ups (7 days)', d.counts.followUps],
                  ['Pending investigations', d.counts.pendingInvestigations],
                  ['Draft prescriptions', d.counts.draftPrescriptions],
                ].map(([label, value]) => (
                  <div className="stat" key={String(label)}>
                    <p className="stat-label">{label}</p>
                    <p className="stat-value">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid-2">
                <section className="card card-accent stack-sm" aria-labelledby="cur-h">
                  <h2 id="cur-h">Current patient</h2>
                  {d.current ? (
                    <>
                      <p className="list-item-title">{d.current.patient.fullName}</p>
                      <p className="small muted">
                        {d.current.patient.uhid} · {d.current.reason ?? 'No reason given'}
                      </p>
                      <div className="button-row">
                        <Button variant="primary" onClick={() => start.mutate(d.current as Appointment)}>
                          Open consultation
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="muted">No consultation in progress.</p>
                  )}
                  <h2>Next patient</h2>
                  {d.next ? (
                    <>
                      <p className="list-item-title">
                        {d.next.queueToken ? `Token ${d.next.queueToken.tokenNumber} · ` : ''}
                        {d.next.patient.fullName}
                      </p>
                      <div className="button-row">
                        <Button variant="secondary" loading={start.isPending} onClick={() => start.mutate(d.next as Appointment)}>
                          Start consultation
                        </Button>
                        <Link className="btn btn-ghost btn-sm" to={`/doctor/patients/${d.next.patientId}`}>
                          Open patient
                        </Link>
                      </div>
                    </>
                  ) : (
                    <p className="muted">Nobody is waiting.</p>
                  )}
                </section>
                <section className="card stack-sm" aria-labelledby="q-h">
                  <h2 id="q-h">Queue</h2>
                  {doctorId && facilityId ? <QueuePanel doctorId={doctorId} facilityId={facilityId} /> : <EmptyState icon="queue" title="No queue today" />}
                </section>
              </div>
              <section className="card stack-sm" aria-labelledby="appts-h">
                <h2 id="appts-h">Today’s appointments</h2>
                {d.appointments.length ? (
                  <ul className="list">
                    {d.appointments.map((a) => (
                      <li key={a.id} className="list-item" data-testid="appointment-row" data-appointment-id={a.id} data-status={a.status}>
                        <div className="list-item-main">
                          <p className="list-item-title">
                            {a.isWalkIn ? 'Walk-in' : formatTime(a.startAt)} · {a.patient.fullName}
                          </p>
                          <p className="list-item-meta">
                            {a.patient.uhid} · <span className="mono">{a.appointmentNumber}</span> · {appointmentTypeLabel[a.type]} · {a.reason ?? '—'} {a.queueToken ? `· Token ${a.queueToken.tokenNumber}` : ''} {a.intake ? '· Intake received' : ''}
                          </p>
                        </div>
                        <StatusBadge status={a.status} label={appointmentStatusLabel[a.status]} />
                        <div className="button-row">
                          <Link className="btn btn-ghost btn-sm" to={`/doctor/patients/${a.patientId}`} aria-label={`Open patient ${a.patient.fullName}`}>
                            Open patient
                          </Link>
                          {startable(a) ? (
                            <Button size="sm" variant="primary" onClick={() => start.mutate(a)} aria-label={`Start consultation for ${a.patient.fullName}`}>
                              {a.encounter ? 'Continue' : 'Start consultation'}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon="calendar" title="No appointments today" />
                )}
              </section>
              <div className="grid-2">
                <section className="card stack-sm" aria-labelledby="res-h">
                  <h2 id="res-h">Results to review</h2>
                  {d.resultsToReview.length ? (
                    <ul className="list">
                      {d.resultsToReview.map((o) => (
                        <li key={o.id} className="list-item small">
                          <Link to={`/doctor/patients/${o.patient.id}`}>
                            {o.investigation.name} · {o.patient.fullName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Nothing to review.</p>
                  )}
                  <h2>Draft prescriptions</h2>
                  {d.drafts.length ? (
                    <ul className="list">
                      {d.drafts.map((r) => (
                        <li key={r.id} className="list-item small">
                          <Link to={`/doctor/encounters/${r.encounterId}`}>
                            {r.prescriptionNumber} · {r.patient.fullName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No drafts.</p>
                  )}
                </section>
                <section className="card stack-sm" aria-labelledby="fu-h">
                  <h2 id="fu-h">Follow-ups due</h2>
                  {d.followUps.length ? (
                    <ul className="list">
                      {d.followUps.map((f) => (
                        <li key={f.id} className="list-item small">
                          <Link to={`/doctor/patients/${f.patient.id}`}>
                            {formatDateOnly(f.followUpDate)} · {f.patient.fullName} ({f.patient.uhid})
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No follow-ups this week.</p>
                  )}
                </section>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
