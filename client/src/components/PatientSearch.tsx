import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '../api/patients';
import type { Patient } from '../types/domain';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ageFrom, formatDate, maskMobile } from '../utils/format';
import { genderLabel } from '../utils/labels';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';

/** Search by UHID, name, mobile, email or appointment number (server enforces authorization). */
export function PatientSearch({ onSelect, actionLabel = 'Open' }: { onSelect: (p: Patient) => void; actionLabel?: string }) {
  const [q, setQ] = useState('');
  const [dob, setDob] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const query = useQuery({ queryKey: ['patient-search', term, dob], queryFn: () => patientsApi.search({ q: term || undefined, dateOfBirth: dob || undefined, pageSize: 10 }), enabled: term.length >= 2 || !!dob });
  return (
    <div className="stack-sm">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="patient-search">Search patients</label>
          <p className="hint" id="patient-search-hint">
            Patient ID (UHID), name, mobile, email or appointment number
          </p>
          <input id="patient-search" data-testid="patient-search-input" className="input" type="search" aria-describedby="patient-search-hint" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="patient-dob">Date of birth</label>
          <input id="patient-dob" className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
      </div>
      {query.isFetching && !query.data ? <LoadingSkeleton lines={2} label="Searching…" /> : null}
      {query.isError ? <ErrorState error={query.error} /> : null}
      {query.data ? (
        query.data.items.length ? (
          <ul className="list" aria-label="Search results">
            {query.data.items.map((p) => (
              <li key={p.id} className="list-item" data-testid="patient-result">
                <div className="list-item-main">
                  <p className="list-item-title">{p.fullName}</p>
                  <p className="list-item-meta">
                    <span className="mono">{p.uhid}</span> · {genderLabel[p.gender] ?? p.gender} · {ageFrom(p.dateOfBirth) ?? '—'} y · DOB {formatDate(p.dateOfBirth)} · {maskMobile(p.mobile)}
                  </p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect(p)} aria-label={`${actionLabel} ${p.fullName}`}>
                  {actionLabel}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No matching patients" message="Check the spelling or search by UHID or mobile number." />
        )
      ) : null}
    </div>
  );
}
