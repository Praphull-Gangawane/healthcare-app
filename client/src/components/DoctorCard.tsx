import type { Doctor } from '../types/domain';
import { formatDate, formatMoney, formatTime, initials } from '../utils/format';
import { appointmentTypeLabel } from '../utils/labels';
import { ButtonLink } from './Button';
import { Icon } from './Icon';

export function DoctorCard({ doctor, headingLevel = 2 }: { doctor: Doctor; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const dept = doctor.departments[0];
  const next = doctor.nextAvailableSlot;
  const bookHref = next ? `/book/${doctor.id}?slot=${encodeURIComponent(next.startAt)}` : `/book/${doctor.id}`;
  return (
    <article className="card doctor-card" data-testid="doctor-card" data-doctor-id={doctor.id} aria-labelledby={`doc-${doctor.id}`}>
      <div className="doctor-card-head">
        <span className="doctor-avatar" aria-hidden="true">
          {initials(doctor.displayName)}
        </span>
        <div style={{ minWidth: 0 }}>
          <H id={`doc-${doctor.id}`}>{doctor.displayName}</H>
          <p className="muted small" style={{ margin: 0 }}>
            {doctor.specialty} · {doctor.qualifications}
          </p>
        </div>
      </div>
      <ul className="doctor-meta">
        <li>
          <Icon name="stethoscope" />
          <span>{doctor.experienceYears} years of experience</span>
        </li>
        {dept ? (
          <li>
            <Icon name="mapPin" />
            <span>
              {dept.department.name}, {dept.facility.name}
              {dept.facility.address ? ` · ${dept.facility.address.city}` : ''}
            </span>
          </li>
        ) : null}
        <li>
          <Icon name="language" />
          <span>{doctor.languages.join(', ')}</span>
        </li>
        <li>
          <Icon name="wallet" />
          <span>
            Consultation fee {formatMoney(doctor.consultationFee)}
            {doctor.consultationTypes.includes('TELECONSULTATION') ? ` · ${appointmentTypeLabel.TELECONSULTATION} available` : ''}
          </span>
        </li>
      </ul>
      {next !== undefined ? (
        <p className={`next-slot ${next ? '' : 'none'}`} style={{ margin: 0 }}>
          <Icon name="clock" />
          {next ? (
            <span>
              Next available: {formatDate(next.startAt)}, {formatTime(next.startAt)}
            </span>
          ) : (
            <span>No open times in the next 7 days</span>
          )}
        </p>
      ) : null}
      <div className="doctor-card-actions">
        <ButtonLink to={`/doctors/${doctor.id}`} variant="secondary" aria-label={`View profile of ${doctor.displayName}`}>
          View profile
        </ButtonLink>
        <ButtonLink to={bookHref} variant="primary" aria-label={`Book appointment with ${doctor.displayName}`}>
          Book appointment
        </ButtonLink>
      </div>
    </article>
  );
}
