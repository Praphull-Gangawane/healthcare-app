import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { directoryApi } from '../../api/directory';
import { AppointmentCalendar } from '../../components/AppointmentCalendar';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { SlotPicker } from '../../components/SlotPicker';
import { formatMoney, todayIso } from '../../utils/format';
import { appointmentTypeLabel } from '../../utils/labels';

export function DoctorProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const doctor = useQuery({ queryKey: ['doctor', id], queryFn: () => directoryApi.doctor(id) });
  const slots = useQuery({ queryKey: ['availability', id, date], queryFn: () => directoryApi.availability(id, date) });
  return (
    <div className="page">
      <QueryState query={doctor}>
        {(d) => (
          <>
            <PageHeader title={d.displayName} subtitle={`${d.specialty} · ${d.qualifications}`} back={{ to: '/doctors', label: 'All doctors' }} docTitle={d.displayName} />
            <div className="split">
              <section className="card stack-sm" aria-labelledby="about-h">
                <h2 id="about-h">About</h2>
                {d.bio ? <p>{d.bio}</p> : null}
                <dl className="kv">
                  <dt>Experience</dt>
                  <dd>{d.experienceYears} years</dd>
                  <dt>Registration</dt>
                  <dd>
                    {d.registrationNumber ?? 'Not provided'} {d.registrationCouncil ? `(${d.registrationCouncil})` : ''}
                  </dd>
                  <dt>Languages</dt>
                  <dd>{d.languages.join(', ')}</dd>
                  <dt>Consultation fee</dt>
                  <dd>{formatMoney(d.consultationFee)}</dd>
                  <dt>Visit types</dt>
                  <dd>{d.consultationTypes.map((t) => appointmentTypeLabel[t]).join(', ')}</dd>
                  <dt>Location</dt>
                  <dd>{d.departments.map((x) => `${x.department.name}, ${x.facility.name}`).join('; ')}</dd>
                </dl>
              </section>
              <section className="card stack-sm" aria-labelledby="avail-h">
                <h2 id="avail-h">Availability</h2>
                <AppointmentCalendar value={date} onChange={setDate} />
                <SlotPicker slots={slots.data?.slots} loading={slots.isLoading} error={slots.error} onRetry={() => void slots.refetch()} selected={null} onSelect={(s) => navigate(`/book/${d.id}?slot=${encodeURIComponent(s.startAt)}`)} />
              </section>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
