import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { patientsApi } from '../../api/patients';
import { appointmentsApi } from '../../api/appointments';
import { Button, ButtonLink } from '../../components/Button';
import { NotificationSettings } from '../../components/NotificationSettings';
import { PageHeader } from '../../components/PageHeader';
import { PatientCard } from '../../components/PatientCard';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { relationshipLabel } from '../../utils/labels';
import { ProfileForm } from '../portal/MyProfile';
import { AppointmentRows } from './ReceptionDashboardPage';

/** Reception sees demographics, scheduling and consents only — never clinical records. */
export function ReceptionPatientDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const p = useQuery({ queryKey: ['patient', id], queryFn: () => patientsApi.get(id) });
  const appts = useQuery({ queryKey: ['appointments', 'patient', id], queryFn: () => appointmentsApi.list({ patientId: id, pageSize: 10 }) });
  const proxies = useQuery({ queryKey: ['proxies', id], queryFn: () => patientsApi.proxies(id) });
  const activate = useMutation({ mutationFn: (proxyId: string) => patientsApi.activateProxy(id, proxyId), onSuccess: () => { toast.success('Caregiver access activated after consent verification.'); void qc.invalidateQueries({ queryKey: ['proxies', id] }); } });
  return (
    <div className="page stack">
      <QueryState query={p}>
        {(patient) => (
          <>
            <PageHeader
              title={patient.fullName}
              subtitle={`UHID ${patient.uhid}`}
              back={{ to: '/reception/patients', label: 'Find patient' }}
              docTitle={patient.uhid}
              actions={
                <>
                  <ButtonLink to={`/reception/book?patientId=${patient.id}`} variant="primary" icon="calendar">
                    Book appointment
                  </ButtonLink>
                  <ButtonLink to={`/reception/walk-in?patientId=${patient.id}`} variant="secondary">
                    Walk-in
                  </ButtonLink>
                </>
              }
            />
            <PatientCard patient={patient} />
            <section className="card stack-sm">
              <h2>Appointments</h2>
              <QueryState query={appts} isEmpty={(d) => !d.items.length} emptyTitle="No appointments">
                {(d) => <AppointmentRows items={d.items} />}
              </QueryState>
            </section>
            <details className="card">
              <summary>Edit contact details</summary>
              <ProfileForm patient={patient} onSaved={() => void qc.invalidateQueries({ queryKey: ['patient', id] })} />
            </details>
            <section className="card stack-sm">
              <h2>Communication consent</h2>
              <NotificationSettings patientId={patient.id} />
            </section>
            <section className="card stack-sm">
              <h2>Caregivers & guardians</h2>
              {proxies.data?.length ? (
                <ul className="list">
                  {proxies.data.map((x) => (
                    <li key={x.id} className="list-item">
                      <div className="list-item-main">
                        <p className="list-item-title">{x.proxy.displayName}</p>
                        <p className="list-item-meta">{relationshipLabel[x.relationship] ?? x.relationship}</p>
                      </div>
                      <StatusBadge status={x.status} label={x.status === 'PENDING' ? 'Pending verification' : x.status} />
                      {x.status === 'PENDING' ? (
                        <Button size="sm" variant="secondary" onClick={() => activate.mutate(x.id)}>
                          Verify consent & activate
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No caregivers linked.</p>
              )}
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
