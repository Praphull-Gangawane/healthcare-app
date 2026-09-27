import type { ReactNode } from 'react';
import type { Patient, PatientRef } from '../types/domain';
import { ageFrom, formatDateOnly, initials, maskMobile } from '../utils/format';
import { genderLabel } from '../utils/labels';

export function PatientCard({ patient, actions, compact, children }: { patient: PatientRef & Partial<Pick<Patient, 'mobile' | 'bloodGroup'>>; actions?: ReactNode; compact?: boolean; children?: ReactNode }) {
  const age = ageFrom(patient.dateOfBirth);
  return (
    <section className={`card ${compact ? 'card-tight' : ''}`} aria-label={`Patient ${patient.fullName}`} data-testid="patient-card">
      <div className="doctor-card-head">
        <span className="doctor-avatar" aria-hidden="true">
          {initials(patient.fullName)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{patient.fullName}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            UHID <span className="mono">{patient.uhid}</span> · {age !== null ? `${age} yrs` : '—'} · {genderLabel[patient.gender] ?? patient.gender}
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            DOB {formatDateOnly(patient.dateOfBirth)}
            {patient.mobile !== undefined ? ` · Mobile ${maskMobile(patient.mobile)}` : ''}
            {patient.bloodGroup ? ` · Blood group ${patient.bloodGroup}` : ''}
          </p>
        </div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
