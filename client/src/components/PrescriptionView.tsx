import type { PrescriptionSnapshot } from '../types/domain';
import { formatDateOnly } from '../utils/format';

/** Read-only rendering of a finalized prescription version (from its immutable snapshot). */
export function PrescriptionView({ snapshot }: { snapshot: PrescriptionSnapshot }) {
  return (
    <article className="rx-sheet stack-sm" aria-label={`Prescription ${snapshot.prescriptionNumber}`}>
      <header className="split">
        <div>
          <p className="list-item-title">{snapshot.facility.name}</p>
          <p className="small muted">{snapshot.facility.address}</p>
        </div>
        <div className="small">
          <p>
            <strong>{snapshot.doctor.name}</strong>
          </p>
          <p>
            {snapshot.doctor.qualifications} · Reg. {snapshot.doctor.registrationNumber ?? '—'}
          </p>
        </div>
      </header>
      <p className="small">
        {snapshot.patient.name} · {snapshot.patient.uhid} · {snapshot.patient.age} y · Visit {snapshot.encounter.date} · <span data-testid="prescription-version">Version {snapshot.version}</span>
      </p>
      {snapshot.allergies.length ? <p className="allergy-alert">Known allergies: {snapshot.allergies.join(', ')}</p> : null}
      {snapshot.amendmentReason ? <p className="small">Amended: {snapshot.amendmentReason}</p> : null}
      <ol className="stack-sm">
        {snapshot.items.map((it, i) => (
          <li key={i} className="rx-med" data-testid="rx-item">
            <p className="rx-med-name">
              {it.medicineName} {it.strength ?? ''}
            </p>
            <p className="rx-med-detail">
              {it.dose} · {it.route} · {it.frequency}
              {it.timing ? ` · ${it.timing}` : ''} · {it.durationDays} days
              {it.instructions ? ` · ${it.instructions}` : ''}
            </p>
          </li>
        ))}
      </ol>
      {snapshot.advice ? (
        <p>
          <strong>Advice:</strong> {snapshot.advice}
        </p>
      ) : null}
      {snapshot.investigations.length ? (
        <p>
          <strong>Tests advised:</strong> {snapshot.investigations.join(', ')}
        </p>
      ) : null}
      {snapshot.followUpDate ? (
        <p>
          <strong>Follow-up:</strong> around {formatDateOnly(snapshot.followUpDate)}
        </p>
      ) : null}
      <p className="small muted">{snapshot.signature.statement}</p>
    </article>
  );
}
