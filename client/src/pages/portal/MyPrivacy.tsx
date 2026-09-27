import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { privacyApi } from '../../api/privacy';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { SelectField, TextareaField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { useRequiredUser } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { PrivacyRequest } from '../../types/domain';
import { saveJson } from '../../utils/download';
import { errorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { privacyStatusLabel, privacyTypeLabel } from '../../utils/labels';

export function MyPrivacy() {
  const user = useRequiredUser();
  const qc = useQueryClient();
  const toast = useToast();
  const pid = user.patientId ?? '';
  const mine = useQuery({ queryKey: ['privacy', 'mine'], queryFn: privacyApi.mine });
  const [type, setType] = useState<PrivacyRequest['type']>('CORRECTION');
  const [details, setDetails] = useState('');
  const exp = useMutation({ mutationFn: () => privacyApi.exportData(pid), onSuccess: (d) => saveJson(d, 'my-health-data.json'), onError: (e) => toast.error(errorMessage(e)) });
  const req = useMutation({
    mutationFn: () => privacyApi.createRequest({ patientId: pid, type, ...(details ? { details } : {}) }),
    onSuccess: () => {
      toast.success('Request received. We will respond within the applicable timelines.');
      setDetails('');
      void qc.invalidateQueries({ queryKey: ['privacy', 'mine'] });
    },
  });
  return (
    <div className="page stack">
      <PageHeader title="Privacy & my data" docTitle="Privacy & my data" />
      <section className="card stack-sm">
        <h2>Download my data</h2>
        <p>Get a copy of your records in a machine-readable format (JSON).</p>
        <div>
          <Button variant="primary" icon="download" loading={exp.isPending} onClick={() => exp.mutate()}>
            Export my data
          </Button>
        </div>
      </section>
      <form
        className="card stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          req.mutate();
        }}
      >
        <h2>Make a request</h2>
        <Alert tone="info" live={false}>
          Medical records may have to be retained by law, so deletion requests are reviewed individually. Deactivation stops portal access but keeps records as required.
        </Alert>
        {req.isError ? <Alert tone="error">{errorMessage(req.error)}</Alert> : null}
        <SelectField label="Request type" value={type} onChange={(e) => setType(e.target.value as PrivacyRequest['type'])} options={(['CORRECTION', 'ACCOUNT_DEACTIVATION', 'ERASURE', 'DATA_EXPORT'] as const).map((t) => ({ value: t, label: privacyTypeLabel[t] ?? t }))} />
        <TextareaField label="Details" optional value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} />
        <div>
          <Button type="submit" variant="secondary" loading={req.isPending}>
            Submit request
          </Button>
        </div>
      </form>
      {mine.data?.length ? (
        <section className="card stack-sm">
          <h2>My requests</h2>
          <ul className="list">
            {mine.data.map((r) => (
              <li key={r.id} className="list-item small">
                {formatDateTime(r.createdAt)} · {privacyTypeLabel[r.type] ?? r.type} · {privacyStatusLabel[r.status] ?? r.status}
                {r.resolution ? ` · ${r.resolution}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
