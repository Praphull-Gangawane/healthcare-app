import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { appointmentsApi } from '../../api/appointments';
import { documentsApi } from '../../api/documents';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/Field';
import { FileUpload } from '../../components/FileUpload';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';
import { formatDateLong, formatTime } from '../../utils/format';
import { appointmentStatusLabel, appointmentTypeLabel } from '../../utils/labels';

function IntakeForm({ appointmentId, editable }: { appointmentId: string; editable: boolean }) {
  const toast = useToast();
  const intake = useQuery({ queryKey: ['intake', appointmentId], queryFn: () => appointmentsApi.getIntake(appointmentId) });
  const [v, setV] = useState({ chiefComplaint: '', symptoms: '', symptomDuration: '', existingConditions: '', allergiesText: '', currentMedications: '' });
  useEffect(() => {
    const i = intake.data;
    if (i) setV({ chiefComplaint: i.chiefComplaint, symptoms: i.symptoms.join(', '), symptomDuration: i.symptomDuration ?? '', existingConditions: i.existingConditions ?? '', allergiesText: i.allergiesText ?? '', currentMedications: i.currentMedications ?? '' });
  }, [intake.data]);
  const save = useMutation({
    mutationFn: () =>
      appointmentsApi.putIntake(appointmentId, {
        chiefComplaint: v.chiefComplaint.trim(),
        symptoms: v.symptoms.split(',').map((s) => s.trim()).filter(Boolean),
        ...(v.symptomDuration ? { symptomDuration: v.symptomDuration } : {}),
        ...(v.existingConditions ? { existingConditions: v.existingConditions } : {}),
        ...(v.allergiesText ? { allergiesText: v.allergiesText } : {}),
        ...(v.currentMedications ? { currentMedications: v.currentMedications } : {}),
      }),
    onSuccess: () => toast.success('Thanks — your doctor will see this before your visit.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const input = (k: keyof typeof v, label: string, textarea = false, hint?: string) => (
    <div className="field">
      <label htmlFor={`intake-${k}`}>{label}</label>
      {hint ? <p className="hint">{hint}</p> : null}
      {textarea ? <textarea id={`intake-${k}`} className="textarea" disabled={!editable} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <input id={`intake-${k}`} className="input" disabled={!editable} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
    </div>
  );
  return (
    <form
      className="card stack-sm"
      aria-labelledby="intake-h"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.chiefComplaint.trim()) return toast.error('Tell us the main reason for your visit.');
        save.mutate();
      }}
    >
      <h2 id="intake-h">Before your visit</h2>
      <p className="muted small">Optional, but it helps your doctor prepare. This form is not monitored — for urgent symptoms call 112.</p>
      <div className="form-grid">
        {input('chiefComplaint', 'Main reason for visit')}
        {input('symptoms', 'Symptoms', false, 'Separate with commas')}
        {input('symptomDuration', 'How long have you had them?')}
        {input('existingConditions', 'Existing conditions', true)}
        {input('allergiesText', 'Allergies', true)}
        {input('currentMedications', 'Current medicines', true)}
      </div>
      {editable ? (
        <div>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save visit details
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function TeleconsultJoin({ appointmentId }: { appointmentId: string }) {
  const [consent, setConsent] = useState(false);
  const join = useMutation({ mutationFn: () => appointmentsApi.joinTeleconsult(appointmentId, consent) });
  return (
    <section className="card stack-sm" aria-labelledby="tele-h">
      <h2 id="tele-h">Video consultation</h2>
      <CheckboxField label="I consent to a video consultation. I understand the doctor may ask me to visit in person if needed." checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <div>
        <Button variant="primary" icon="video" disabled={!consent} loading={join.isPending} onClick={() => join.mutate()}>
          Join video consultation
        </Button>
      </div>
      {join.isError ? <Alert tone="error">{errorMessage(join.error)}</Alert> : null}
      {join.data ? <Alert tone="success">Secure session ready (demo video provider). Your join token expires at {formatTime(String(join.data.expiresAt ?? ''))}.</Alert> : null}
    </section>
  );
}

export function AppointmentDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['appointment', id], queryFn: () => appointmentsApi.get(id) });
  const upload = useMutation({
    mutationFn: ({ file, title, patientId }: { file: File; title: string; patientId: string }) => documentsApi.upload({ patientId, file, ...(title ? { title } : {}) }),
    onSuccess: () => {
      toast.success('Document uploaded.');
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="page stack">
      <QueryState query={q}>
        {(a) => {
          const editable = ['HELD', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING'].includes(a.status);
          return (
            <>
              <PageHeader title={`${formatDateLong(a.startAt)} · ${formatTime(a.startAt)}`} subtitle={`${a.doctor.displayName} · ${a.facility.name}`} back={{ to: '/portal/appointments', label: 'My appointments' }} docTitle="Appointment" />
              <section className="card stack-sm">
                <dl className="kv">
                  <dt>Appointment ID</dt>
                  <dd className="mono">{a.appointmentNumber}</dd>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={a.status} label={appointmentStatusLabel[a.status]} />
                  </dd>
                  <dt>Type</dt>
                  <dd>{appointmentTypeLabel[a.type]}</dd>
                  <dt>Patient</dt>
                  <dd>{a.patient.fullName}</dd>
                  {a.queueToken ? (
                    <>
                      <dt>Queue token</dt>
                      <dd data-testid="queue-token">Token {a.queueToken.tokenNumber}</dd>
                    </>
                  ) : null}
                </dl>
              </section>
              {a.type === 'TELECONSULTATION' && editable ? <TeleconsultJoin appointmentId={a.id} /> : null}
              <IntakeForm appointmentId={a.id} editable={editable} />
              {editable ? (
                <section className="card stack-sm" aria-labelledby="up-h">
                  <h2 id="up-h">Share previous reports</h2>
                  <FileUpload label="Upload a report or letter" busy={upload.isPending} onUpload={(file, title) => upload.mutateAsync({ file, title, patientId: a.patientId }).then(() => undefined)} />
                </section>
              ) : null}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
