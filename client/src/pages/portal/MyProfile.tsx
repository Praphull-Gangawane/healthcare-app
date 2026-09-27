import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../../api/patients';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useRequiredUser } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { PatientDetail } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

export function ProfileForm({ patient, onSaved }: { patient: PatientDetail; onSaved?: () => void }) {
  const toast = useToast();
  const initial = (patient: PatientDetail) => {
    const ec = patient.contacts.find((c) => c.isEmergency);
    return { firstName: patient.firstName, lastName: patient.lastName ?? '', mobile: patient.mobile ?? '', email: patient.email ?? '', line1: patient.address?.line1 ?? '', city: patient.address?.city ?? '', state: patient.address?.state ?? '', postalCode: patient.address?.postalCode ?? '', ecName: ec?.name ?? '', ecRelationship: ec?.relationship ?? '', ecPhone: ec?.phone ?? '' };
  };
  const [v, setV] = useState(() => initial(patient));
  const [seen, setSeen] = useState(patient);
  if (seen !== patient) {
    setSeen(patient);
    setV(initial(patient));
  }
  const save = useMutation({
    mutationFn: () =>
      patientsApi.update(patient.id, {
        firstName: v.firstName,
        ...(v.lastName ? { lastName: v.lastName } : {}),
        ...(v.mobile ? { mobile: v.mobile } : {}),
        ...(v.email ? { email: v.email } : {}),
        ...(v.line1 && v.city && v.state ? { address: { line1: v.line1, city: v.city, state: v.state, ...(v.postalCode ? { postalCode: v.postalCode } : {}), country: 'IN' } } : {}),
        ...(v.ecName && v.ecPhone ? { emergencyContact: { name: v.ecName, relationship: v.ecRelationship || 'Family', phone: v.ecPhone } } : {}),
      }),
    onSuccess: () => {
      toast.success('Profile updated.');
      onSaved?.();
    },
  });
  const field = (k: keyof typeof v, label: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} className="input" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="small muted">
        Patient ID <span className="mono">{patient.uhid}</span> · Date of birth {formatDate(patient.dateOfBirth)}. To correct your date of birth, please contact reception.
      </p>
      {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      <div className="form-grid">
        {field('firstName', 'First name')}
        {field('lastName', 'Last name')}
        {field('mobile', 'Mobile number', 'tel')}
        {field('email', 'Email', 'email')}
        {field('line1', 'Address')}
        {field('city', 'City')}
        {field('state', 'State')}
        {field('postalCode', 'PIN code')}
        {field('ecName', 'Emergency contact name')}
        {field('ecRelationship', 'Emergency contact relationship')}
        {field('ecPhone', 'Emergency contact mobile', 'tel')}
      </div>
      <div>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function MyProfile() {
  const user = useRequiredUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['patient', user.patientId], queryFn: () => patientsApi.get(user.patientId ?? ''), enabled: !!user.patientId });
  const profile = useQuery({ queryKey: ['medical-profile', user.patientId], queryFn: () => patientsApi.medicalProfile(user.patientId ?? ''), enabled: !!user.patientId });
  return (
    <div className="page stack">
      <PageHeader title="My profile" docTitle="My profile" />
      <QueryState query={q}>{(p) => <ProfileForm patient={p} onSaved={() => void qc.invalidateQueries({ queryKey: ['patient', p.id] })} />}</QueryState>
      <QueryState query={profile}>
        {(m) => (
          <section className="card stack-sm" aria-labelledby="mp-h">
            <h2 id="mp-h">Medical profile</h2>
            <dl className="kv">
              <dt>Blood group</dt>
              <dd>{m.bloodGroup ?? 'Not recorded'}</dd>
              <dt>Allergies</dt>
              <dd>{m.allergies.length ? m.allergies.map((a) => a.substance).join(', ') : 'None recorded'}</dd>
              <dt>Conditions & history</dt>
              <dd>{m.history.length ? m.history.map((h) => h.description).join('; ') : 'None recorded'}</dd>
            </dl>
            <p className="small muted">Your care team keeps this up to date. Tell your doctor or reception about any changes.</p>
          </section>
        )}
      </QueryState>
    </div>
  );
}
