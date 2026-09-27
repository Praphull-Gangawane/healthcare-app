import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientsApi } from '../../api/patients';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CheckboxField, SelectField, TextField, TextareaField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../hooks/useToast';
import type { DuplicateCandidate } from '../../types/domain';
import { errorCode, errorMessage, fieldIssues } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const EMPTY = { firstName: '', lastName: '', dateOfBirth: '', gender: '', mobile: '', email: '', line1: '', city: '', state: '', postalCode: '', ecName: '', ecRelationship: '', ecPhone: '', bloodGroup: '', allergies: '', conditions: '', sms: true, whatsapp: false, emailConsent: false };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function RegisterPatientPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(confirmNotDuplicate = false) {
    setBusy(true);
    setError(null);
    setIssues({});
    try {
      const p = await patientsApi.create({
        firstName: v.firstName,
        ...(v.lastName ? { lastName: v.lastName } : {}),
        dateOfBirth: v.dateOfBirth,
        gender: v.gender,
        ...(v.mobile ? { mobile: v.mobile } : {}),
        ...(v.email ? { email: v.email } : {}),
        ...(v.line1 && v.city && v.state ? { address: { line1: v.line1, city: v.city, state: v.state, ...(v.postalCode ? { postalCode: v.postalCode } : {}), country: 'IN' } } : {}),
        ...(v.ecName && v.ecPhone ? { emergencyContact: { name: v.ecName, relationship: v.ecRelationship || 'Family', phone: v.ecPhone } } : {}),
        medicalProfile: { ...(v.bloodGroup ? { bloodGroup: v.bloodGroup } : {}), allergies: list(v.allergies).map((substance) => ({ substance })), conditions: list(v.conditions) },
        consents: { sms: v.sms, whatsapp: v.whatsapp, email: v.emailConsent },
        ...(confirmNotDuplicate ? { confirmNotDuplicate: true } : {}),
      });
      toast.success(`Registered ${p.fullName} · ${p.uhid}`);
      navigate(`/reception/patients/${p.id}`);
    } catch (err) {
      if (errorCode(err) === 'PATIENT_POSSIBLE_DUPLICATE') {
        const d = (err as { details?: { candidates?: DuplicateCandidate[] } }).details;
        setCandidates(d?.candidates ?? []);
      } else {
        setError(errorMessage(err));
        setIssues(Object.fromEntries(fieldIssues(err).map((i) => [i.path, i.message])));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <PageHeader title="Register patient" subtitle="Collect only what is needed for care. A unique patient ID (UHID) is generated automatically." docTitle="Register patient" />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {candidates ? (
        <section className="card stack-sm" data-testid="duplicate-candidates" aria-labelledby="dup-h">
          <Alert tone="warning" title="Possible existing patient">
            A patient with matching details may already exist. Open the existing record, or confirm this is a different person. Records are never merged automatically.
          </Alert>
          <ul className="list" id="dup-h">
            {candidates.map((c) => (
              <li key={c.id} className="list-item">
                <div className="list-item-main">
                  <p className="list-item-title">{c.fullName}</p>
                  <p className="list-item-meta">
                    <span className="mono">{c.uhid}</span> · DOB {formatDate(c.dateOfBirth)} · {c.mobile ?? '—'}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/reception/patients/${c.id}`)}>
                  Open existing
                </Button>
              </li>
            ))}
          </ul>
          <div className="button-row">
            <Button variant="danger-outline" loading={busy} onClick={() => void submit(true)}>
              Confirm new patient
            </Button>
            <Button variant="ghost" onClick={() => setCandidates(null)}>
              Edit details
            </Button>
          </div>
        </section>
      ) : null}
      <form
        className="card stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <fieldset className="form-grid">
          <legend className="section-title">Identity</legend>
          <TextField label="First name" value={v.firstName} onChange={set('firstName')} error={issues.firstName} required />
          <TextField label="Last name" optional value={v.lastName} onChange={set('lastName')} />
          <TextField label="Date of birth" type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} error={issues.dateOfBirth} required />
          <SelectField label="Gender" placeholder="Select…" value={v.gender} onChange={set('gender')} error={issues.gender} options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }, { value: 'UNDISCLOSED', label: 'Prefer not to say' }]} />
        </fieldset>
        <fieldset className="form-grid">
          <legend className="section-title">Contact</legend>
          <TextField label="Mobile" type="tel" optional value={v.mobile} onChange={set('mobile')} error={issues.mobile} />
          <TextField label="Email" type="email" optional value={v.email} onChange={set('email')} error={issues.email} />
          <TextField label="Address" optional value={v.line1} onChange={set('line1')} />
          <TextField label="City" optional value={v.city} onChange={set('city')} />
          <TextField label="State" optional value={v.state} onChange={set('state')} />
          <TextField label="PIN code" optional value={v.postalCode} onChange={set('postalCode')} error={issues['address.postalCode']} />
          <TextField label="Emergency contact name" optional value={v.ecName} onChange={set('ecName')} />
          <TextField label="Emergency contact relationship" optional value={v.ecRelationship} onChange={set('ecRelationship')} />
          <TextField label="Emergency contact mobile" optional value={v.ecPhone} onChange={set('ecPhone')} />
        </fieldset>
        <fieldset className="form-grid">
          <legend className="section-title">Medical profile (optional)</legend>
          <SelectField label="Blood group" optional placeholder="Unknown" value={v.bloodGroup} onChange={set('bloodGroup')} options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({ value: b, label: b }))} />
          <TextareaField label="Allergies" optional hint="Comma separated" value={v.allergies} onChange={set('allergies')} />
          <TextareaField label="Existing conditions" optional hint="Comma separated" value={v.conditions} onChange={set('conditions')} />
        </fieldset>
        <fieldset className="stack-sm">
          <legend className="section-title">Consent recorded at the desk</legend>
          <CheckboxField label="Patient agrees to SMS updates" checked={v.sms} onChange={set('sms')} />
          <CheckboxField label="Patient opts in to WhatsApp updates" checked={v.whatsapp} onChange={set('whatsapp')} />
          <CheckboxField label="Patient agrees to email updates" checked={v.emailConsent} onChange={set('emailConsent')} />
        </fieldset>
        <div>
          <Button type="submit" variant="primary" loading={busy} loadingText="Registering…">
            Register patient
          </Button>
        </div>
      </form>
    </div>
  );
}
