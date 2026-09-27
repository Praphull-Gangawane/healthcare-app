import type { Doctor, FacilitySummary } from '../types/domain';

export function FacilityDoctorPicker({ facilities, facilityId, onFacility, doctors, doctorId, onDoctor }: { facilities: FacilitySummary[]; facilityId: string; onFacility: (v: string) => void; doctors: Doctor[]; doctorId: string; onDoctor: (v: string) => void }) {
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="pick-facility">Facility</label>
        <select id="pick-facility" className="select" value={facilityId} onChange={(e) => onFacility(e.target.value)}>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pick-doctor">Doctor</label>
        <select id="pick-doctor" className="select" value={doctorId} onChange={(e) => onDoctor(e.target.value)}>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.displayName} — {d.specialty}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
