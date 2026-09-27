/** Choose whose records to view (self or a dependent). Hidden when there is only one option. */
export function PatientPicker({ options, value, onChange }: { options: { id: string; label: string }[]; value: string | null; onChange: (id: string) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="field" style={{ maxWidth: 360 }}>
      <label htmlFor="patient-picker">Showing records for</label>
      <select id="patient-picker" className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
