import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardsApi } from '../../api/dashboards';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useRequiredUser } from '../../hooks/useAuth';
import { formatDate, formatDateLong, formatTime } from '../../utils/format';
import { appointmentStatusLabel, appointmentTypeLabel } from '../../utils/labels';

export function PortalHome() {
  const user = useRequiredUser();
  const q = useQuery({ queryKey: ['dashboard', 'patient'], queryFn: dashboardsApi.patient });
  return (
    <div className="page stack">
      <PageHeader title={`Hello, ${user.displayName.split(' ')[0]}`} subtitle="Your appointments, prescriptions and reports in one place." docTitle="My dashboard" />
      <nav aria-label="Quick actions" className="button-row">
        <ButtonLink to="/doctors" variant="primary" icon="calendar">
          Book appointment
        </ButtonLink>
        <ButtonLink to="/portal/prescriptions" variant="secondary" icon="pill">
          View prescriptions
        </ButtonLink>
        <ButtonLink to="/portal/reports" variant="secondary" icon="flask">
          View reports
        </ButtonLink>
        <ButtonLink to="/portal/profile" variant="ghost" icon="user">
          My profile
        </ButtonLink>
        <ButtonLink to="/portal/dependents" variant="ghost" icon="users">
          My dependents
        </ButtonLink>
      </nav>
      <QueryState query={q}>
        {(d) => (
          <div className="grid-2">
            <section className="card card-accent stack-sm" aria-labelledby="next-h">
              <h2 id="next-h">Next appointment</h2>
              {d.nextAppointment ? (
                <>
                  <p className="reading-value">
                    {formatDateLong(d.nextAppointment.startAt)} · {formatTime(d.nextAppointment.startAt)}
                  </p>
                  <p>
                    {d.nextAppointment.doctor.displayName} · {d.nextAppointment.doctor.specialty}
                  </p>
                  <p className="muted small">
                    {d.nextAppointment.facility.name} · {appointmentTypeLabel[d.nextAppointment.type]} · for {d.nextAppointment.patient.fullName}
                  </p>
                  <StatusBadge status={d.nextAppointment.status} label={appointmentStatusLabel[d.nextAppointment.status]} />
                  <div>
                    <ButtonLink to={`/portal/appointments/${d.nextAppointment.id}`} variant="secondary" size="sm">
                      View details
                    </ButtonLink>
                  </div>
                </>
              ) : (
                <EmptyState icon="calendar" title="No upcoming appointments" action={<ButtonLink to="/doctors" variant="primary" size="sm">Book now</ButtonLink>} />
              )}
              {d.upcoming.length > 1 ? (
                <>
                  <h3>Upcoming reminders</h3>
                  <ul className="list">
                    {d.upcoming.slice(1).map((a) => (
                      <li key={a.id} className="list-item small">
                        <Link to={`/portal/appointments/${a.id}`}>
                          {formatDate(a.startAt)} {formatTime(a.startAt)} — {a.doctor.displayName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
            <section className="card stack-sm" aria-labelledby="rx-h">
              <h2 id="rx-h">Recent prescriptions</h2>
              {d.recentPrescriptions.length ? (
                <ul className="list">
                  {d.recentPrescriptions.map((r) => (
                    <li key={r.id} className="list-item">
                      <div className="list-item-main">
                        <Link className="list-item-title" to={`/portal/prescriptions/${r.id}`}>
                          {r.prescriptionNumber}
                        </Link>
                        <p className="list-item-meta">
                          {r.doctor.displayName} · {formatDate(r.finalizedAt)} · {r.patient.fullName}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No prescriptions yet.</p>
              )}
            </section>
            <section className="card stack-sm" aria-labelledby="rep-h">
              <h2 id="rep-h">Recent reports</h2>
              {d.recentReports.length ? (
                <ul className="list">
                  {d.recentReports.map((r) => (
                    <li key={r.id} className="list-item">
                      <Link to="/portal/reports">{r.investigation.name}</Link>
                      <span className="small muted">
                        {' '}
                        · {formatDate(r.releasedToPatientAt)} · {r.patient.fullName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No reports yet.</p>
              )}
            </section>
            <section className="card stack-sm" aria-labelledby="vis-h">
              <h2 id="vis-h">Recent visits</h2>
              {d.recentVisits.length ? (
                <ul className="list">
                  {d.recentVisits.map((v) => (
                    <li key={v.id} className="list-item small">
                      {formatDate(v.startedAt)} · {v.doctor.displayName} · {v.patient.fullName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No visits yet.</p>
              )}
              <Link to="/portal/timeline">See full medical timeline</Link>
            </section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
