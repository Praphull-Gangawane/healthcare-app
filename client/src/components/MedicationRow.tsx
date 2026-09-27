import type { PrescriptionItem } from '../types/domain';
import { Button } from './Button';

export const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Every 8 hours', 'At bedtime', 'As needed (SOS)', 'Once weekly'];
export const TIMINGS = ['After food', 'Before food', 'With food', 'At bedtime', 'Empty stomach', 'Any time'];
export const ROUTES = ['Oral', 'Topical', 'Inhalation', 'Nasal', 'Eye drops', 'Ear drops', 'Sublingual', 'Injection'];

export type ItemIssue = Partial<Record<keyof PrescriptionItem, string>>;

export function validateItem(it: PrescriptionItem): ItemIssue {
  const e: ItemIssue = {};
  if (!it.medicineName.trim()) e.medicineName = 'Medicine is required';
  if (!it.dose.trim()) e.dose = 'Dose is required';
  if (!it.route.trim()) e.route = 'Route is required';
  if (!it.frequency.trim()) e.frequency = 'Frequency is required';
  if (!Number.isInteger(it.durationDays) || it.durationDays < 1 || it.durationDays > 365) e.durationDays = 'Duration must be 1–365 days';
  return e;
}

/** One editable prescription line. */
export function MedicationRow({ index, item, count, issues, disabled, onChange, onRemove, onMove }: { index: number; item: PrescriptionItem; count: number; issues: ItemIssue; disabled?: boolean; onChange: (patch: Partial<PrescriptionItem>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  const id = `med-${index}`;
  const field = (key: keyof PrescriptionItem, label: string, input: React.ReactNode) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
      {issues[key] ? (
        <p className="field-error" id={`${id}-${key}-err`}>
          {issues[key]}
        </p>
      ) : null}
    </div>
  );
  const text = (key: 'medicineName' | 'strength' | 'dose' | 'quantity' | 'instructions', label: string) =>
    field(
      key,
      label,
      <input id={`${id}-${key}`} className="input" disabled={disabled} value={(item[key] as string | null | undefined) ?? ''} aria-invalid={issues[key] ? true : undefined} aria-describedby={issues[key] ? `${id}-${key}-err` : undefined} onChange={(e) => onChange({ [key]: e.target.value })} />,
    );
  const select = (key: 'route' | 'frequency' | 'timing', label: string, options: string[]) =>
    field(
      key,
      label,
      <select id={`${id}-${key}`} className="select" disabled={disabled} value={(item[key] as string | null | undefined) ?? ''} aria-invalid={issues[key] ? true : undefined} onChange={(e) => onChange({ [key]: e.target.value })}>
        <option value="">Select…</option>
        {[...new Set([...(item[key] ? [item[key] as string] : []), ...options])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>,
    );
  return (
    <li className="card card-tight medication-row" data-testid="medication-row" aria-label={`Medicine ${index + 1}: ${item.medicineName || 'new'}`}>
      <div className="medication-row-head">
        <strong>
          {index + 1}. {item.medicineName || 'New medicine'} {item.strength ?? ''}
        </strong>
        <div className="button-row">
          <Button size="sm" variant="ghost" icon="arrowUp" disabled={disabled || index === 0} aria-label={`Move medicine ${index + 1} up`} onClick={() => onMove(-1)} />
          <Button size="sm" variant="ghost" icon="arrowDown" disabled={disabled || index === count - 1} aria-label={`Move medicine ${index + 1} down`} onClick={() => onMove(1)} />
          <Button size="sm" variant="danger-outline" icon="trash" disabled={disabled} aria-label={`Remove medicine ${index + 1}`} onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <div className="form-grid">
        {text('medicineName', 'Medicine (generic name)')}
        {text('strength', 'Strength')}
        {text('dose', 'Dose')}
        {select('route', 'Route', ROUTES)}
        {select('frequency', 'Frequency', FREQUENCIES)}
        {select('timing', 'Timing', TIMINGS)}
        {field(
          'durationDays',
          'Duration (days)',
          <input id={`${id}-durationDays`} className="input" type="number" min={1} max={365} disabled={disabled} value={Number.isFinite(item.durationDays) ? item.durationDays : ''} aria-invalid={issues.durationDays ? true : undefined} onChange={(e) => onChange({ durationDays: Number(e.target.value) })} />,
        )}
        {text('quantity', 'Quantity')}
        {text('instructions', 'Instructions')}
      </div>
    </li>
  );
}
