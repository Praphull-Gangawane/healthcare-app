import { useEffect, useRef } from 'react';
import { addDaysIso, isoDateParts, todayIso } from '../utils/format';

/**
 * Date strip (next N days) plus a date input to jump further ahead ("month picker").
 * Dates are clinic-local YYYY-MM-DD strings.
 */
export function AppointmentCalendar({ value, onChange, days = 14, maxDays = 60, label = 'Choose a date' }: { value: string; onChange: (d: string) => void; days?: number; maxDays?: number; label?: string }) {
  const today = todayIso();
  const strip = Array.from({ length: days }, (_, i) => addDaysIso(today, i));
  const inStrip = strip.includes(value);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  return (
    <div className="appointment-calendar" data-testid="appointment-calendar">
      <div className="calendar-controls">
        <div className="field">
          <label htmlFor="calendar-date">{label}</label>
          <input
            id="calendar-date"
            type="date"
            className="input"
            min={today}
            max={addDaysIso(today, maxDays)}
            value={value}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          />
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {inStrip ? 'Or pick one of the next two weeks below.' : `Showing ${isoDateParts(value).long}.`}
        </p>
      </div>
      <ul className="date-strip" ref={listRef} aria-label="Next available dates">
        {strip.map((d) => {
          const parts = isoDateParts(d);
          return (
            <li key={d}>
              <button type="button" className="date-chip" aria-pressed={d === value} aria-label={`${parts.long}${d === today ? ' (today)' : ''}`} onClick={() => onChange(d)} data-date={d}>
                <span className="dow">{d === today ? 'Today' : parts.dow}</span>
                <span className="day">{parts.day}</span>
                <span className="mon">{parts.month}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
