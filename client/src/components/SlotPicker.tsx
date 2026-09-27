import type { Slot } from '../types/domain';
import { formatLocalTime } from '../utils/format';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingSkeleton } from './LoadingSkeleton';

function period(localTime: string) {
  const h = Number(localTime.slice(0, 2));
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

/** Time slots grouped by part of day. Unavailable slots are shown disabled with a text reason. */
export function SlotPicker({ slots, selected, onSelect, loading, error, onRetry, showUnavailable = false }: { slots: Slot[] | undefined; selected: string | null; onSelect: (slot: Slot) => void; loading?: boolean; error?: unknown; onRetry?: () => void; showUnavailable?: boolean }) {
  if (loading) return <LoadingSkeleton lines={3} label="Checking availability…" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} title="Couldn't load available times" />;
  const visible = (slots ?? []).filter((s) => showUnavailable || s.status === 'AVAILABLE');
  if (!visible.length) {
    return <EmptyState icon="calendar" title="No available times on this date" message="Please choose another date. New times open up when other patients cancel." />;
  }
  const groups = new Map<string, Slot[]>();
  for (const s of visible) groups.set(period(s.localTime), [...(groups.get(period(s.localTime)) ?? []), s]);
  return (
    <div className="slot-picker" data-testid="slot-picker">
      {[...groups.entries()].map(([name, list]) => (
        <section key={name} className="slot-group" aria-label={`${name} times`}>
          <h3>{name}</h3>
          <ul className="slot-grid">
            {list.map((s) => {
              const available = s.status === 'AVAILABLE';
              const label = `${formatLocalTime(s.localTime)}${available ? '' : ' — unavailable'}`;
              return (
                <li key={s.startAt}>
                  <button
                    type="button"
                    className="slot-button"
                    data-testid="slot-button"
                    data-start={s.startAt}
                    aria-pressed={selected === s.startAt}
                    aria-label={label}
                    disabled={!available}
                    onClick={() => onSelect(s)}
                  >
                    {formatLocalTime(s.localTime)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
