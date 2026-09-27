import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { appointmentsApi } from '../../api/appointments';
import { patientsApi } from '../../api/patients';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { CheckboxField } from '../../components/Field';
import { FacilityDoctorPicker } from '../../components/FacilityDoctorPicker';
import { PageHeader } from '../../components/PageHeader';
import { PatientCard } from '../../components/PatientCard';
import { PatientSearch } from '../../components/PatientSearch';
import { useFacilityDoctors } from '../../hooks/useFacilityDoctors';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { errorMessage } from '../../utils/errors';

export function WalkInPage() {
  const [params] = useSearchParams();
  const fd = useFacilityDoctors();
  const idem = useIdempotencyKey();
  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const [reason, setReason] = useState('');
  const [urgent, setUrgent] = useState(false);
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => patientsApi.get(patientId), enabled: !!patientId });
  const walkIn = useMutation({ mutationFn: () => idem.run(`walkin:${patientId}:${fd.doctorId}`, (k) => appointmentsApi.walkIn({ patientId, doctorId: fd.doctorId, facilityId: fd.facilityId, ...(reason ? { reason } : {}), urgent }, k)) });
  return (
    <div className="page stack">
      <PageHeader title="Walk-in" subtitle="Add a patient without an appointment to a doctor’s queue." docTitle="Walk-in" actions={<ButtonLink to="/reception/register" variant="ghost">New patient</ButtonLink>} />
      {walkIn.data ? (
        <Alert tone="success" title="Added to queue">
          {walkIn.data.patient.fullName} · <strong data-testid="queue-token">Token {walkIn.data.queueToken?.tokenNumber}</strong> for {walkIn.data.doctor.displayName}
        </Alert>
      ) : null}
      {walkIn.isError ? <Alert tone="error">{errorMessage(walkIn.error)}</Alert> : null}
      <section className="card stack-sm">
        <h2>Patient</h2>
        {patient.data ? <PatientCard patient={patient.data} actions={<Button size="sm" variant="ghost" onClick={() => setPatientId('')}>Change</Button>} /> : <PatientSearch actionLabel="Select" onSelect={(p) => setPatientId(p.id)} />}
      </section>
      <section className="card stack-sm">
        <h2>Doctor</h2>
        <FacilityDoctorPicker facilities={fd.facilities} facilityId={fd.facilityId} onFacility={fd.setFacilityId} doctors={fd.doctors} doctorId={fd.doctorId} onDoctor={fd.setDoctorId} />
        <div className="field">
          <label htmlFor="wi-reason">Reason for visit</label>
          <input id="wi-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <CheckboxField label="Priority (clinical staff requested priority)" hint="Priority is set by staff judgement — the system never classifies emergencies from symptoms." checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        <div>
          <Button variant="primary" disabled={!patientId || !fd.doctorId} loading={walkIn.isPending} onClick={() => walkIn.mutate()}>
            Add to queue
          </Button>
        </div>
      </section>
    </div>
  );
}
