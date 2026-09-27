import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { encountersApi, prescriptionsApi, type SoapDraft } from '../../api/clinical';
import { healthApi } from '../../api/health';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { InvestigationOrderForm } from '../../components/InvestigationOrderForm';
import { useDocumentOpener } from '../../components/MedicalDocumentViewer';
import { Modal } from '../../components/Modal';
import { PatientCard } from '../../components/PatientCard';
import { PrescriptionBuilder } from '../../components/PrescriptionBuilder';
import { validateItem } from '../../components/MedicationRow';
import { PrescriptionView } from '../../components/PrescriptionView';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { VitalCard } from '../../components/VitalCard';
import { VitalsForm } from '../../components/VitalsForm';
import { ReadingRow } from '../portal/HealthDataPage';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../hooks/useToast';
import type { DiagnosisType, Encounter, PrescriptionItem } from '../../types/domain';
import { errorCode, errorMessage } from '../../utils/errors';
import { formatDateTime, formatTime } from '../../utils/format';
import { diagnosisTypeLabel, investigationStatusStaffLabel, priorityLabel } from '../../utils/labels';
import { readSession, removeSession, writeSession } from '../../utils/storage';
import { latestByType } from '../../utils/vitals';

type Soap = Omit<SoapDraft, 'version'>;
const fromEncounter = (e: Encounter): Soap => ({
  chiefComplaint: e.chiefComplaint ?? '',
  historyOfIllness: e.historyOfIllness ?? '',
  examinationFindings: e.examinationFindings ?? '',
  assessmentNotes: e.assessmentNotes ?? '',
  planNotes: e.planNotes ?? '',
  followUpInstructions: e.followUpInstructions ?? '',
  followUpDate: e.followUpDate ? e.followUpDate.slice(0, 10) : null,
});

/** SOAP draft with debounced autosave, optimistic versioning and a local copy for connection loss. */
function useSoapDraft(enc: Encounter) {
  const qc = useQueryClient();
  const toast = useToast();
  const storeKey = `soap:${enc.id}`;
  const [soap, setSoap] = useState<Soap>(() => readSession<Soap>(storeKey) ?? fromEncounter(enc));
  const [restored] = useState(() => readSession<Soap>(storeKey) !== null);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>(restored ? 'dirty' : 'saved');
  const version = useRef(enc.version);
  useEffect(() => {
    version.current = Math.max(version.current, enc.version);
  }, [enc.version]);
  const timer = useRef<number | undefined>(undefined);

  const save = useCallback(
    async (value: Soap) => {
      setState('saving');
      try {
        const next = await encountersApi.saveDraft(enc.id, { ...value, version: version.current });
        version.current = next.version;
        qc.setQueryData(['encounter', enc.id], next);
        removeSession(storeKey);
        setState('saved');
      } catch (err) {
        setState('error');
        if (errorCode(err) === 'STALE_VERSION') {
          toast.error('This consultation was updated elsewhere. The latest version has been loaded; your local copy is kept.');
          const fresh = await encountersApi.get(enc.id);
          version.current = fresh.version;
          qc.setQueryData(['encounter', enc.id], fresh);
        }
      }
    },
    [enc.id, qc, storeKey, toast],
  );

  const update = (patch: Partial<Soap>) => {
    setSoap((s) => {
      const next = { ...s, ...patch };
      writeSession(storeKey, next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(next), 1500);
      return next;
    });
    setState('dirty');
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { soap, update, state, restored, saveNow: () => save(soap) };
}

function SoapSection({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card soap-section stack-sm" aria-labelledby={`soap-${letter}`}>
      <h2 id={`soap-${letter}`}>
        <span className="soap-letter" aria-hidden="true">
          {letter}
        </span>{' '}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Diagnoses({ enc, editable }: { enc: Encounter; editable: boolean }) {
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiagnosisType>('PRIMARY');
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['encounter', enc.id] });
  const add = useMutation({ mutationFn: () => encountersApi.addDiagnosis(enc.id, { description: description.trim(), ...(code.trim() ? { code: code.trim().toUpperCase() } : {}), codeSystem: code.trim() ? 'ICD10' : 'FREE_TEXT', type }), onSuccess: () => { setDescription(''); setCode(''); invalidate(); } });
  const remove = useMutation({ mutationFn: (id: string) => encountersApi.removeDiagnosis(id), onSuccess: invalidate });
  return (
    <div className="stack-sm">
      <ul className="list" data-testid="diagnosis-list" aria-label="Diagnoses">
        {enc.diagnoses.map((d) => (
          <li key={d.id} className="list-item">
            <div className="list-item-main">
              <p className="list-item-title">
                {d.description} {d.code ? <span className="mono">({d.code})</span> : null}
              </p>
              <p className="list-item-meta">{diagnosisTypeLabel[d.type]}</p>
            </div>
            {editable ? (
              <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove diagnosis ${d.description}`} onClick={() => remove.mutate(d.id)}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
        {!enc.diagnoses.length ? <li className="muted small">No diagnosis recorded yet.</li> : null}
      </ul>
      {editable ? (
        <form
          className="form-grid"
          aria-label="Add diagnosis"
          onSubmit={(e) => {
            e.preventDefault();
            if (description.trim()) add.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="dx-desc">Diagnosis</label>
            <input id="dx-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dx-code">ICD-10 code (optional)</label>
            <input id="dx-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dx-type">Type</label>
            <select id="dx-type" className="select" value={type} onChange={(e) => setType(e.target.value as DiagnosisType)}>
              {(Object.keys(diagnosisTypeLabel) as DiagnosisType[]).map((t) => (
                <option key={t} value={t}>
                  {diagnosisTypeLabel[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="label" aria-hidden="true">
              &nbsp;
            </span>
            <Button type="submit" variant="secondary" icon="plus" loading={add.isPending} disabled={!description.trim()}>
              Add diagnosis
            </Button>
          </div>
          {add.isError ? (
            <p className="field-error" role="alert">
              {errorMessage(add.error)}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function PrescriptionPanel({ enc }: { enc: Encounter }) {
  const qc = useQueryClient();
  const toast = useToast();
  const idem = useIdempotencyKey();
  const opener = useDocumentOpener();
  const rxRef = enc.prescriptions.find((p) => p.status === 'DRAFT') ?? enc.prescriptions.find((p) => p.status !== 'CANCELLED');
  const rx = useQuery({ queryKey: ['prescription', rxRef?.id], queryFn: () => prescriptionsApi.get(rxRef?.id ?? ''), enabled: !!rxRef });
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [amending, setAmending] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const d = rx.data;
    if (!d || loadedFor.current === `${d.id}:${d.currentVersion}`) return;
    loadedFor.current = `${d.id}:${d.currentVersion}`;
    const src = d.status === 'DRAFT' ? d.items : d.current?.snapshot?.items;
    setItems((src ?? []).map((i) => ({ ...i })));
    setAdvice(d.advice ?? '');
    setFollowUp(d.followUpDate ? d.followUpDate.slice(0, 10) : '');
  }, [rx.data]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['encounter', enc.id] });
    void qc.invalidateQueries({ queryKey: ['prescription'] });
  };
  const create = useMutation({ mutationFn: () => encountersApi.createPrescription(enc.id), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const clean = (list: PrescriptionItem[]) => list.map(({ id: _id, ...rest }) => ({ ...rest, medicationId: rest.medicationId ?? undefined, strength: rest.strength || undefined, timing: rest.timing || undefined, quantity: rest.quantity || undefined, instructions: rest.instructions || undefined, refills: rest.refills ?? 0 })) as PrescriptionItem[];
  const valid = items.length > 0 && items.every((i) => Object.keys(validateItem(i)).length === 0);
  const saveDraft = useMutation({
    mutationFn: () => prescriptionsApi.updateDraft(rxRef?.id ?? '', { items: clean(items), advice, followUpDate: followUp || null }),
    onSuccess: (d) => {
      qc.setQueryData(['prescription', d.id], d);
      toast.success('Prescription draft saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const finalize = useMutation({
    mutationFn: async () => {
      await prescriptionsApi.updateDraft(rxRef?.id ?? '', { items: clean(items), advice, followUpDate: followUp || null });
      return idem.run(`finalize:${rxRef?.id}`, (k) => prescriptionsApi.finalize(rxRef?.id ?? '', k));
    },
    onSuccess: () => {
      setConfirming(false);
      toast.success('Prescription finalized. The patient has been notified securely.');
      refresh();
    },
  });
  const amend = useMutation({
    mutationFn: () => idem.run(`amend:${rxRef?.id}:${rx.data?.currentVersion}`, (k) => prescriptionsApi.amend(rxRef?.id ?? '', { reason: amendReason.trim(), items: clean(items), advice, followUpDate: followUp || null }, k)),
    onSuccess: () => {
      setAmending(false);
      setAmendReason('');
      toast.success('Amended version created. The original version is preserved.');
      refresh();
    },
  });

  if (!rxRef) {
    return (
      <div>
        <Button variant="secondary" icon="pill" loading={create.isPending} disabled={enc.status !== 'IN_PROGRESS'} onClick={() => create.mutate()}>
          Create prescription
        </Button>
      </div>
    );
  }
  return (
    <QueryState query={rx}>
      {(d) =>
        d.status === 'DRAFT' ? (
          <div className="stack-sm">
            <p>
              <span className="draft-badge" data-testid="prescription-status">
                DRAFT · NOT FINALIZED
              </span>{' '}
              <span className="small muted mono">{d.prescriptionNumber}</span>
            </p>
            <PrescriptionBuilder items={items} onChange={setItems} warnings={d.warnings} showErrors={showErrors} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="rx-advice">Advice (non-drug instructions)</label>
                <textarea id="rx-advice" className="textarea" value={advice} maxLength={2000} onChange={(e) => setAdvice(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rx-follow">Follow-up date</label>
                <input id="rx-follow" className="input" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </div>
            </div>
            <div className="button-row">
              <Button variant="secondary" loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
                Save draft
              </Button>
              <Button
                variant="primary"
                icon="check"
                data-testid="finalize-prescription"
                onClick={() => {
                  setShowErrors(true);
                  if (valid) setConfirming(true);
                  else toast.error('Complete the highlighted fields before finalizing.');
                }}
              >
                Finalize prescription
              </Button>
            </div>
            <ConfirmationDialog
              open={confirming}
              title="Finalize prescription?"
              message="It cannot be edited afterwards; any change will create an amended version. The patient will receive a secure notification."
              confirmLabel="Finalize and sign"
              loading={finalize.isPending}
              error={finalize.error ? errorMessage(finalize.error) : null}
              onConfirm={() => finalize.mutate()}
              onCancel={() => {
                setConfirming(false);
                finalize.reset();
              }}
            />
          </div>
        ) : (
          <div className="stack-sm">
            <p>
              <StatusBadge status={d.status} label={d.status === 'AMENDED' ? `Amended · Version ${d.currentVersion}` : `Prescription finalized · Version ${d.currentVersion}`} />
              <span className="small muted"> · Patient notified securely</span>
            </p>
            {d.current?.snapshot ? <PrescriptionView snapshot={d.current.snapshot} /> : null}
            <div className="button-row">
              {d.current?.documentId ? (
                <Button variant="secondary" icon="eye" onClick={() => void opener.open(d.current?.documentId as string, `Prescription ${d.prescriptionNumber}`)}>
                  View PDF
                </Button>
              ) : null}
              <Button variant="ghost" icon="edit" onClick={() => setAmending(true)}>
                Amend prescription
              </Button>
            </div>
            {opener.viewer}
            <Modal
              open={amending}
              title="Amend prescription"
              size="lg"
              onClose={() => setAmending(false)}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setAmending(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" disabled={amendReason.trim().length < 5 || !valid} loading={amend.isPending} onClick={() => amend.mutate()}>
                    Create amended version
                  </Button>
                </>
              }
            >
              <Alert tone="info" live={false}>
                Version {d.currentVersion} stays in the record unchanged. A new version {d.currentVersion + 1} is created with your reason.
              </Alert>
              {amend.isError ? <Alert tone="error">{errorMessage(amend.error)}</Alert> : null}
              <div className="field">
                <label htmlFor="amend-reason">Reason for amendment</label>
                <input id="amend-reason" className="input" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />
              </div>
              <PrescriptionBuilder items={items} onChange={setItems} showErrors />
            </Modal>
          </div>
        )
      }
    </QueryState>
  );
}

function DeviceReadings({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const readings = useQuery({ queryKey: ['health-readings', patientId], queryFn: () => healthApi.readings(patientId) });
  const promote = useMutation({
    mutationFn: (id: string) => healthApi.promote(id, encounterId),
    onSuccess: () => {
      toast.success('Reading added to the vitals record.');
      void qc.invalidateQueries({ queryKey: ['health-readings', patientId] });
      void qc.invalidateQueries({ queryKey: ['encounter', encounterId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!readings.data?.length) return null;
  return (
    <details>
      <summary>Patient-shared heart-rate readings ({readings.data.length})</summary>
      <ul className="list">
        {readings.data.slice(0, 8).map((r) => (
          <ReadingRow
            key={r.id}
            r={r}
            action={
              r.validation === 'VALID' && !r.promotedVitalId ? (
                <Button size="sm" variant="ghost" onClick={() => promote.mutate(r.id)}>
                  Add to record
                </Button>
              ) : r.validation === 'WELLNESS_ESTIMATE' ? (
                <span className="small muted">Estimate — cannot be added</span>
              ) : r.promotedVitalId ? (
                <span className="small muted">In record</span>
              ) : null
            }
          />
        ))}
      </ul>
    </details>
  );
}

function ConsultationBody({ enc }: { enc: Encounter }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const idem = useIdempotencyKey();
  const online = useOnlineStatus();
  const draft = useSoapDraft(enc);
  const editable = enc.status === 'IN_PROGRESS';
  const [completing, setCompleting] = useState(false);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['encounter', enc.id] });
  const vitals = useMutation({ mutationFn: (m: Parameters<typeof encountersApi.recordVitals>[1]) => encountersApi.recordVitals(enc.id, m), onSuccess: (rows) => { invalidate(); toast.success(`${rows.length} measurement${rows.length === 1 ? '' : 's'} recorded.`); } });
  const order = useMutation({ mutationFn: (b: Parameters<typeof encountersApi.order>[1]) => encountersApi.order(enc.id, b), onSuccess: () => { invalidate(); toast.success('Test ordered.'); } });
  const complete = useMutation({
    mutationFn: async () => {
      await draft.saveNow();
      return idem.run(`complete:${enc.id}`, (k) => encountersApi.complete(enc.id, { ...(draft.soap.followUpDate ? { followUpDate: draft.soap.followUpDate } : {}), ...(draft.soap.followUpInstructions ? { followUpInstructions: draft.soap.followUpInstructions } : {}) }, k));
    },
    onSuccess: () => {
      setCompleting(false);
      removeSession(`soap:${enc.id}`);
      toast.success('Visit completed.');
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/doctor');
    },
  });
  const text = (k: keyof Soap, label: string, rows = 3) => (
    <div className="field">
      <label htmlFor={`soap-${k}`}>{label}</label>
      <textarea id={`soap-${k}`} className="textarea" rows={rows} disabled={!editable} value={(draft.soap[k] as string | null | undefined) ?? ''} onChange={(e) => draft.update({ [k]: e.target.value })} />
    </div>
  );
  const intake = enc.appointment?.intake;
  const latest = latestByType(enc.vitals);
  return (
    <div className="stack">
      <header className="consult-header">
        <PatientCard patient={enc.patient} compact actions={<ButtonLink to={`/doctor/patients/${enc.patientId}`} variant="ghost" size="sm">Full record & history</ButtonLink>}>
          <p className="small muted">
            {enc.encounterNumber} · started {formatTime(enc.startedAt)} {enc.appointment ? `· ${enc.appointment.appointmentNumber}` : ''}
          </p>
        </PatientCard>
        <div className="consult-header-row">
          {editable ? (
            <span className="draft-badge" data-testid="draft-badge">
              DRAFT · NOT FINALIZED
            </span>
          ) : (
            <StatusBadge status="COMPLETED" label={`Completed ${formatDateTime(enc.completedAt)}`} />
          )}
          <span className="save-indicator" role="status" aria-live="polite">
            {!online ? 'Offline — changes kept on this device' : draft.state === 'saving' ? 'Saving draft…' : draft.state === 'dirty' ? 'Unsaved changes' : draft.state === 'error' ? 'Not saved — will retry on next change' : 'Draft saved'}
          </span>
        </div>
      </header>
      {draft.restored && editable ? (
        <Alert tone="warning" title="Unsaved local draft restored">
          We restored notes kept on this device after a connection problem. They will be saved when you continue editing.
        </Alert>
      ) : null}
      <div className="consult-grid">
        <div className="stack">
          <SoapSection letter="S" title="Subjective">
            {intake ? (
              <Alert tone="info" title="Patient intake" live={false}>
                {intake.chiefComplaint}
                {intake.symptoms.length ? ` · Symptoms: ${intake.symptoms.join(', ')}` : ''}
                {intake.symptomDuration ? ` · for ${intake.symptomDuration}` : ''}
                {intake.allergiesText ? ` · Allergies: ${intake.allergiesText}` : ''}
                {intake.currentMedications ? ` · Medicines: ${intake.currentMedications}` : ''}
              </Alert>
            ) : null}
            {text('chiefComplaint', 'Chief complaint', 2)}
            {text('historyOfIllness', 'History of present illness', 4)}
          </SoapSection>
          <SoapSection letter="O" title="Objective">
            <div className="vital-grid">
              {latest.map((v) => (
                <VitalCard key={v.id} vital={v} />
              ))}
            </div>
            {editable ? <VitalsForm busy={vitals.isPending} error={vitals.error ? errorMessage(vitals.error) : null} onSubmit={(m) => vitals.mutateAsync(m)} /> : null}
            <DeviceReadings patientId={enc.patientId} encounterId={enc.id} />
            {text('examinationFindings', 'Examination findings', 4)}
          </SoapSection>
        </div>
        <div className="stack">
          <SoapSection letter="A" title="Assessment">
            <Diagnoses enc={enc} editable={editable} />
            {text('assessmentNotes', 'Assessment notes', 3)}
          </SoapSection>
          <SoapSection letter="P" title="Plan">
            {text('planNotes', 'Plan', 3)}
            <h3>Investigations</h3>
            <ul className="list">
              {enc.orders.map((o) => (
                <li key={o.id} className="list-item small">
                  {o.investigation.name} · {priorityLabel[o.priority]} · {investigationStatusStaffLabel[o.status]}
                </li>
              ))}
            </ul>
            {editable ? <InvestigationOrderForm busy={order.isPending} error={order.error ? errorMessage(order.error) : null} onOrder={(b) => order.mutateAsync(b)} /> : null}
            <h3>Prescription</h3>
            <PrescriptionPanel enc={enc} />
            <h3>Follow-up</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="soap-followUpDate">Follow-up date</label>
                <input id="soap-followUpDate" className="input" type="date" disabled={!editable} value={draft.soap.followUpDate ?? ''} onChange={(e) => draft.update({ followUpDate: e.target.value || null })} />
              </div>
              {text('followUpInstructions', 'Follow-up instructions for the patient', 2)}
            </div>
          </SoapSection>
          {editable ? (
            <div className="button-row">
              <Button variant="primary" icon="checkCircle" onClick={() => setCompleting(true)}>
                Complete visit
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmationDialog
        open={completing}
        title="Complete this visit?"
        message="Draft notes will be finalized. You can still add an addendum later."
        confirmLabel="Complete visit"
        loading={complete.isPending}
        error={complete.error ? errorMessage(complete.error) : null}
        onConfirm={() => complete.mutate()}
        onCancel={() => {
          setCompleting(false);
          complete.reset();
        }}
      />
    </div>
  );
}

export function ConsultationPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['encounter', id], queryFn: () => encountersApi.get(id) });
  return (
    <div className="page">
      <h1 className="visually-hidden">Consultation</h1>
      <QueryState query={q}>{(enc) => <ConsultationBody key={enc.id} enc={enc} />}</QueryState>
    </div>
  );
}
