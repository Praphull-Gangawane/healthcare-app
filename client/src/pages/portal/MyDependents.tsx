import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../../api/patients';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CheckboxField, SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { ageFrom, formatDate } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import { relationshipLabel } from '../../utils/labels';

export function MyDependents() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['dependents'], queryFn: patientsApi.dependents });
  const [v, setV] = useState({ firstName: '', lastName: '', dateOfBirth: '', gender: '', relationship: 'CHILD', attest: false });
  const age = v.dateOfBirth ? ageFrom(v.dateOfBirth) : null;
  const adult = age !== null && age >= 18;
  const add = useMutation({
    mutationFn: () => patientsApi.addDependent({ firstName: v.firstName, ...(v.lastName ? { lastName: v.lastName } : {}), dateOfBirth: v.dateOfBirth, gender: v.gender, relationship: v.relationship, ...(adult ? { adultConsentAttestation: v.attest } : {}) }),
    onSuccess: (r) => {
      toast.success(r.proxy.status === 'ACTIVE' ? `${r.patient.fullName} added.` : `${r.patient.fullName} added — access starts after the clinic verifies their consent.`);
      setV({ firstName: '', lastName: '', dateOfBirth: '', gender: '', relationship: 'CHILD', attest: false });
      void qc.invalidateQueries({ queryKey: ['dependents'] });
    },
  });
  return (
    <div className="page stack">
      <PageHeader title="My dependents" subtitle="Manage care for children and family members you look after." docTitle="My dependents" />
      <QueryState query={q} isEmpty={(d) => !d.length} emptyTitle="No dependents yet">
        {(list) => (
          <ul className="list">
            {list.map((d) => (
              <li key={d.proxyId} className="list-item" data-testid="dependent-row">
                <div className="list-item-main">
                  <p className="list-item-title">{d.patient.fullName}</p>
                  <p className="list-item-meta">
                    {relationshipLabel[d.relationship] ?? d.relationship} · born {formatDate(d.patient.dateOfBirth)} · <span className="mono">{d.patient.uhid}</span>
                  </p>
                </div>
                <StatusBadge status={d.status} label={d.status === 'ACTIVE' ? 'Active' : 'Awaiting verification'} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <form
        className="card stack-sm"
        aria-labelledby="add-dep-h"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h2 id="add-dep-h">Add a dependent</h2>
        {add.isError ? <Alert tone="error">{errorMessage(add.error)}</Alert> : null}
        <div className="form-grid">
          <TextField label="First name" required value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
          <TextField label="Last name" optional value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
          <TextField label="Date of birth" type="date" required value={v.dateOfBirth} onChange={(e) => setV({ ...v, dateOfBirth: e.target.value })} />
          <SelectField label="Gender" placeholder="Select…" required value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }, { value: 'UNDISCLOSED', label: 'Prefer not to say' }]} />
          <SelectField label="Relationship to you" value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} options={['CHILD', 'PARENT', 'SPOUSE', 'LEGAL_GUARDIAN', 'CAREGIVER', 'OTHER'].map((r) => ({ value: r, label: relationshipLabel[r] ?? r }))} />
        </div>
        {adult ? (
          <Alert tone="info" title="Adults decide who can see their records">
            <CheckboxField label="I confirm this adult has agreed to me managing their appointments and records. The clinic will verify this before access starts." checked={v.attest} onChange={(e) => setV({ ...v, attest: e.target.checked })} />
          </Alert>
        ) : null}
        <div>
          <Button type="submit" variant="primary" icon="plus" loading={add.isPending} disabled={!v.firstName || !v.dateOfBirth || !v.gender}>
            Add dependent
          </Button>
        </div>
      </form>
    </div>
  );
}
