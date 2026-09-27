import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { patientsApi } from '../../api/patients';
import { prescriptionsApi, vitalsApi } from '../../api/clinical';
import { investigationsApi } from '../../api/investigations';
import { documentsApi } from '../../api/documents';
import { healthApi } from '../../api/health';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { MedicalDocumentViewer } from '../../components/MedicalDocumentViewer';
import { PageHeader } from '../../components/PageHeader';
import { PatientCard } from '../../components/PatientCard';
import { PatientTimeline, TimelineFilters } from '../../components/PatientTimeline';
import { QueryState } from '../../components/QueryState';
import { TrendChart } from '../../components/TrendChart';
import { LabResultsTable } from '../portal/MyReports';
import { ReadingRow } from '../portal/HealthDataPage';
import type { PrescriptionItem, PrescriptionListItem, TimelineType, VitalType } from '../../types/domain';
import { isForbidden } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import { vitalTypeLabel, vitalUnit } from '../../utils/labels';

const TABS = ['Overview', 'Timeline', 'Vitals', 'Lab results', 'Prescriptions', 'Documents', 'Health data'] as const;
type Tab = (typeof TABS)[number];

const itemKey = (i: PrescriptionItem) => `${i.medicineName}|${i.strength ?? ''}|${i.dose}|${i.frequency}|${i.durationDays}`;

function Compare({ list }: { list: PrescriptionListItem[] }) {
  const [a, setA] = useState(list[1]?.id ?? '');
  const [b, setB] = useState(list[0]?.id ?? '');
  const left = list.find((x) => x.id === a);
  const right = list.find((x) => x.id === b);
  const col = (rx: PrescriptionListItem | undefined, other: PrescriptionListItem | undefined) => (
    <ul className="list">
      {rx?.items.map((i, k) => {
        const inOther = other?.items.some((o) => itemKey(o) === itemKey(i));
        return (
          <li key={k} className={`list-item small ${inOther ? '' : 'diff-added'}`}>
            {i.medicineName} {i.strength ?? ''} · {i.dose} · {i.frequency} · {i.durationDays} d {inOther ? '' : <strong>(changed/new)</strong>}
          </li>
        );
      })}
    </ul>
  );
  if (list.length < 2) return null;
  const pick = (id: string, v: string, set: (s: string) => void, label: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={v} onChange={(e) => set(e.target.value)}>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {formatDate(x.finalizedAt ?? x.createdAt)} · {x.prescriptionNumber}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <section className="card stack-sm" aria-labelledby="cmp-h">
      <h2 id="cmp-h">Compare prescriptions</h2>
      <div className="compare-grid">
        <div>
          {pick('cmp-a', a, setA, 'Earlier')}
          {col(left, right)}
        </div>
        <div>
          {pick('cmp-b', b, setB, 'Later')}
          {col(right, left)}
        </div>
      </div>
    </section>
  );
}

function VitalsTab({ patientId, reason }: { patientId: string; reason?: string }) {
  const [type, setType] = useState<VitalType>('HEART_RATE');
  const trend = useQuery({ queryKey: ['vital-trend', patientId, type, reason], queryFn: () => vitalsApi.trend(patientId, type, reason) });
  return (
    <section className="card stack-sm">
      <div className="field" style={{ maxWidth: 280 }}>
        <label htmlFor="vt-type">Measurement</label>
        <select id="vt-type" className="select" value={type} onChange={(e) => setType(e.target.value as VitalType)}>
          {(Object.keys(vitalTypeLabel) as VitalType[]).map((t) => (
            <option key={t} value={t}>
              {vitalTypeLabel[t]}
            </option>
          ))}
        </select>
      </div>
      <QueryState query={trend}>{(pts) => <TrendChart title={vitalTypeLabel[type]} unit={vitalUnit[type]} secondLabel="Diastolic" points={pts.map((p) => ({ date: p.measuredAt, value: p.value, value2: p.value2 }))} />}</QueryState>
    </section>
  );
}

export function PatientRecordPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('Overview');
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [draftReason, setDraftReason] = useState('');
  const [types, setTypes] = useState<TimelineType[]>([]);
  const patient = useQuery({ queryKey: ['patient', id, reason], queryFn: () => patientsApi.get(id, reason) });
  const profile = useQuery({ queryKey: ['medical-profile', id, reason], queryFn: () => patientsApi.medicalProfile(id, reason), retry: false });
  const denied = profile.isError && isForbidden(profile.error);
  const clinicalOk = profile.isSuccess;
  const timeline = useQuery({ queryKey: ['timeline', id, types.join(','), reason], queryFn: () => patientsApi.timeline(id, types.length ? types : undefined, reason), enabled: clinicalOk && tab === 'Timeline' });
  const labs = useQuery({ queryKey: ['reports', id, reason], queryFn: () => investigationsApi.listForPatient(id, reason), enabled: clinicalOk && tab === 'Lab results' });
  const rx = useQuery({ queryKey: ['prescriptions', id, reason], queryFn: () => prescriptionsApi.listForPatient(id, reason), enabled: clinicalOk && tab === 'Prescriptions' });
  const docs = useQuery({ queryKey: ['documents', id, reason], queryFn: () => documentsApi.list(id, reason), enabled: clinicalOk && tab === 'Documents' });
  const readings = useQuery({ queryKey: ['health-readings', id, reason], queryFn: () => healthApi.readings(id, reason), enabled: clinicalOk && tab === 'Health data' });

  return (
    <div className="page stack">
      <QueryState query={patient}>
        {(p) => (
          <>
            <PageHeader title={p.fullName} subtitle={`Patient record · ${p.uhid}`} back={{ to: '/doctor', label: 'Today' }} docTitle={`Patient ${p.uhid}`} />
            <PatientCard patient={p} />
          </>
        )}
      </QueryState>
      {denied ? (
        <form
          className="card stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftReason.trim().length >= 10) setReason(draftReason.trim());
          }}
        >
          <Alert tone="warning" title="This patient is not under your care">
            You can open the clinical record in an emergency. Your reason is recorded in the audit trail and reviewed.
          </Alert>
          <div className="field">
            <label htmlFor="bg-reason">Reason for emergency access (at least 10 characters)</label>
            <textarea id="bg-reason" className="textarea" value={draftReason} onChange={(e) => setDraftReason(e.target.value)} />
          </div>
          <div>
            <Button type="submit" variant="danger" disabled={draftReason.trim().length < 10}>
              Open with emergency access
            </Button>
          </div>
        </form>
      ) : null}
      {clinicalOk ? (
        <>
          {reason ? <Alert tone="warning">Emergency access in use — audited.</Alert> : null}
          <div className="tabs" role="tablist" aria-label="Record sections">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tab}>
            {tab === 'Overview' && profile.data ? (
              <section className="card stack-sm">
                <dl className="kv">
                  <dt>Blood group</dt>
                  <dd>{profile.data.bloodGroup ?? '—'}</dd>
                  <dt>Allergies</dt>
                  <dd>{profile.data.allergies.length ? profile.data.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ') : 'None recorded'}</dd>
                  <dt>History</dt>
                  <dd>
                    <ul>
                      {profile.data.history.map((h) => (
                        <li key={h.id}>
                          {h.type.replace(/_/g, ' ').toLowerCase()}: {h.description}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </dl>
              </section>
            ) : null}
            {tab === 'Timeline' ? (
              <div className="stack-sm">
                <TimelineFilters selected={types} onChange={setTypes} />
                <QueryState query={timeline}>{(items) => <PatientTimeline items={items} />}</QueryState>
              </div>
            ) : null}
            {tab === 'Vitals' ? <VitalsTab patientId={id} {...(reason ? { reason } : {})} /> : null}
            {tab === 'Lab results' ? (
              <QueryState query={labs} isEmpty={(d) => !d.length} emptyTitle="No investigations">
                {(orders) => (
                  <div className="stack">
                    {orders.map((o) => (
                      <section key={o.id} className="card stack-sm">
                        <h2>
                          {o.investigation.name} <span className="small muted">· {o.status} · {formatDate(o.createdAt)}</span>
                        </h2>
                        {o.results.length ? <LabResultsTable order={o} /> : <p className="muted">No results yet.</p>}
                      </section>
                    ))}
                  </div>
                )}
              </QueryState>
            ) : null}
            {tab === 'Prescriptions' ? (
              <QueryState query={rx} isEmpty={(d) => !d.length} emptyTitle="No prescriptions">
                {(list) => (
                  <div className="stack">
                    <Compare list={list.filter((r) => r.status !== 'DRAFT')} />
                    <ul className="list">
                      {list.map((r) => (
                        <li key={r.id} className="list-item">
                          <div className="list-item-main">
                            <p className="list-item-title">
                              {formatDate(r.finalizedAt ?? r.createdAt)} · {r.prescriptionNumber} · {r.status}
                            </p>
                            <p className="list-item-meta">{r.items.map((i) => `${i.medicineName} ${i.strength ?? ''}`).join(', ')}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </QueryState>
            ) : null}
            {tab === 'Documents' ? <QueryState query={docs}>{(d) => <MedicalDocumentViewer documents={d} />}</QueryState> : null}
            {tab === 'Health data' ? (
              <QueryState query={readings} isEmpty={(d) => !d.length} emptyTitle="No shared readings">
                {(list) => (
                  <ul className="list">
                    {list.map((r) => (
                      <ReadingRow key={r.id} r={r} />
                    ))}
                  </ul>
                )}
              </QueryState>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
