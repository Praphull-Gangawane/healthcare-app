import { Link } from 'react-router-dom';
import type { TimelineItem, TimelineType } from '../types/domain';
import { formatDate } from '../utils/format';
import { EmptyState } from './EmptyState';

export const TIMELINE_FILTERS: { type: TimelineType; label: string }[] = [
  { type: 'CONSULTATION', label: 'Consultations' },
  { type: 'PRESCRIPTION', label: 'Prescriptions' },
  { type: 'LAB', label: 'Lab' },
  { type: 'IMAGING', label: 'Imaging' },
  { type: 'DOCUMENT', label: 'Documents' },
  { type: 'VITALS', label: 'Vitals' },
];

export function TimelineFilters({ selected, onChange }: { selected: TimelineType[]; onChange: (t: TimelineType[]) => void }) {
  return (
    <fieldset className="chip-row" aria-label="Filter timeline">
      <legend className="visually-hidden">Show record types</legend>
      {TIMELINE_FILTERS.map((f) => {
        const on = selected.includes(f.type);
        return (
          <button key={f.type} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? selected.filter((s) => s !== f.type) : [...selected, f.type])}>
            {f.label}
          </button>
        );
      })}
    </fieldset>
  );
}

/** Longitudinal record, newest first. `linkFor` maps an item to a detail route when one exists. */
export function PatientTimeline({ items, linkFor }: { items: TimelineItem[]; linkFor?: (item: TimelineItem) => string | null }) {
  if (!items.length) return <EmptyState icon="list" title="No records to show" message="Records appear here after visits, prescriptions and reports." />;
  return (
    <ol className="timeline">
      {items.map((item) => {
        const href = linkFor?.(item) ?? null;
        return (
          <li key={item.id} className="timeline-item" data-testid="timeline-item" data-type={item.type}>
            <span className="timeline-marker" aria-hidden="true" />
            <p className="timeline-date">
              <time dateTime={item.date}>{formatDate(item.date)}</time> · {TIMELINE_FILTERS.find((f) => f.type === item.type)?.label ?? item.type}
            </p>
            <h3>{href ? <Link to={href}>{item.title}</Link> : item.title}</h3>
            <ul className="timeline-summary">
              {item.summary.map((s, i) => (
                <li key={`${i}-${s}`}>{s}</li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
