import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { prescriptionsApi } from '../../api/clinical';
import { Button } from '../../components/Button';
import { useDocumentOpener } from '../../components/MedicalDocumentViewer';
import { PageHeader } from '../../components/PageHeader';
import { PrescriptionView } from '../../components/PrescriptionView';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../utils/format';

export function PrescriptionDetail({ backTo = '/portal/prescriptions' }: { backTo?: string }) {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['prescription', id], queryFn: () => prescriptionsApi.get(id) });
  const [version, setVersion] = useState<number | null>(null);
  const opener = useDocumentOpener();
  return (
    <div className="page stack">
      <QueryState query={q}>
        {(rx) => {
          const v = rx.versions.find((x) => x.versionNumber === (version ?? rx.currentVersion)) ?? rx.current;
          return (
            <>
              <PageHeader title={`Prescription ${rx.prescriptionNumber}`} subtitle={rx.doctor ? `${rx.doctor.displayName} · ${rx.doctor.specialty}` : undefined} back={{ to: backTo, label: 'Back' }} docTitle="Prescription" />
              <div className="button-row">
                <StatusBadge status={rx.status} label={rx.status === 'AMENDED' ? 'Amended' : 'Finalized'} />
                {v?.documentId ? (
                  <Button variant="primary" icon="download" loading={opener.busy === v.documentId} onClick={() => void opener.open(v.documentId as string, `${rx.prescriptionNumber}-v${v.versionNumber}.pdf`, 'download')}>
                    Download PDF
                  </Button>
                ) : null}
                {v?.documentId ? (
                  <Button variant="secondary" icon="eye" onClick={() => void opener.open(v.documentId as string, `Prescription ${rx.prescriptionNumber}`)}>
                    View PDF
                  </Button>
                ) : null}
              </div>
              {opener.error ? (
                <p className="field-error" role="alert">
                  {opener.error}
                </p>
              ) : null}
              {rx.versions.length > 1 ? (
                <div className="field" style={{ maxWidth: 320 }}>
                  <label htmlFor="rx-version">Version</label>
                  <select id="rx-version" className="select" value={v?.versionNumber} onChange={(e) => setVersion(Number(e.target.value))}>
                    {rx.versions.map((x) => (
                      <option key={x.versionNumber} value={x.versionNumber}>
                        Version {x.versionNumber} · {formatDateTime(x.createdAt)}
                        {x.amendmentReason ? ` · ${x.amendmentReason}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {v?.snapshot ? <PrescriptionView snapshot={v.snapshot} /> : null}
              {opener.viewer}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
