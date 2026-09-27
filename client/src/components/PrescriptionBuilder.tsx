import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prescriptionsApi } from '../api/clinical';
import type { Medication, PrescriptionItem } from '../types/domain';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Alert } from './Alert';
import { Button } from './Button';
import { MedicationRow, validateItem } from './MedicationRow';

const blank = (m?: Medication): PrescriptionItem => ({
  medicationId: m?.id ?? null,
  medicineName: m?.genericName ?? '',
  strength: m?.strength ?? '',
  dose: m ? (['Tablet', 'Capsule'].includes(m.form) ? `1 ${m.form.toLowerCase()}` : 'As directed') : '',
  route: m?.route ?? 'Oral',
  frequency: '',
  timing: '',
  durationDays: 5,
  quantity: '',
  instructions: '',
  refills: 0,
});

/** Controlled list editor: search medicines, add/edit/remove/reorder rows. Persistence is the parent's job. */
export function PrescriptionBuilder({ items, onChange, disabled, warnings, showErrors }: { items: PrescriptionItem[]; onChange: (items: PrescriptionItem[]) => void; disabled?: boolean; warnings?: string[]; showErrors?: boolean }) {
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 250);
  const search = useQuery({ queryKey: ['medications', debounced], queryFn: () => prescriptionsApi.searchMedications(debounced), enabled: debounced.trim().length >= 2 });
  const update = (i: number, patch: Partial<PrescriptionItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const j = i + dir;
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    onChange(next);
  };
  return (
    <section className="stack-sm" data-testid="prescription-builder" aria-label="Prescription builder">
      {warnings?.length ? (
        <Alert tone="warning" title="Allergy check — please review">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {!disabled ? (
        <div className="field">
          <label htmlFor="med-search">Search medicine (generic name)</label>
          <input id="med-search" className="input" type="search" autoComplete="off" placeholder="Type at least 2 letters, e.g. parac" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && search.data?.length ? (
            <ul className="search-results" aria-label="Medicine search results">
              {search.data.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="search-result-btn"
                    onClick={() => {
                      onChange([...items, blank(m)]);
                      setQ('');
                    }}
                  >
                    {m.genericName} {m.strength} · {m.form} · {m.route}
                  </button>
                </li>
              ))}
            </ul>
          ) : q.trim().length >= 2 && debounced.length >= 2 && search.isSuccess ? (
            <p className="small muted">No catalogue match — you can add it manually.</p>
          ) : null}
          <div>
            <Button variant="secondary" icon="plus" size="sm" onClick={() => onChange([...items, { ...blank(), medicineName: q }])}>
              Add medicine
            </Button>
          </div>
        </div>
      ) : null}
      {items.length ? (
        <ol className="med-rows">
          {items.map((it, i) => (
            <MedicationRow key={it.id ?? `new-${i}`} index={i} count={items.length} item={it} disabled={disabled} issues={showErrors ? validateItem(it) : {}} onChange={(p) => update(i, p)} onRemove={() => onChange(items.filter((_, k) => k !== i))} onMove={(d) => move(i, d)} />
          ))}
        </ol>
      ) : (
        <p className="muted">No medicines added yet.</p>
      )}
    </section>
  );
}
