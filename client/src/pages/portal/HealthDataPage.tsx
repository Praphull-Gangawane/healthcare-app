import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { healthApi } from '../../api/health';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CameraPpgDemo } from '../../components/CameraPpgDemo';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useRequiredUser } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { HealthReading } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { healthProviderLabel, measurementFlagLabel } from '../../utils/labels';

export function ReadingRow({ r, action }: { r: HealthReading; action?: React.ReactNode }) {
  const source = r.source ? `${r.source.deviceName ?? healthProviderLabel[r.source.providerType] ?? r.source.providerType}` : '';
  return (
    <li className="list-item" data-testid="heart-rate-reading" data-validation={r.validation}>
      <div className="list-item-main">
        <p className="list-item-title">
          {Number(r.value)} {r.unit} <span className="small muted">· Source: {source}</span>
        </p>
        <p className="list-item-meta">
          {formatDateTime(r.measuredAt)} · {r.validation === 'WELLNESS_ESTIMATE' ? 'DEMO / WELLNESS ESTIMATE' : r.validation === 'INVALID' ? `Not accepted — ${r.validationMessage ?? 'invalid reading'}` : 'Device reading (not clinically validated)'}
        </p>
        {r.guidance?.message ? <p className="small">{r.guidance.message}{r.guidance.emergencyMessage ? ` ${r.guidance.emergencyMessage}` : ''}</p> : null}
      </div>
      {r.validation === 'VALID' && r.flag !== 'NOT_EVALUATED' ? <StatusBadge status={r.flag} label={measurementFlagLabel[r.flag]} /> : null}
      {action}
    </li>
  );
}

export function HealthDataPage() {
  const user = useRequiredUser();
  const pid = user.patientId ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const sources = useQuery({ queryKey: ['health-sources', pid], queryFn: () => healthApi.sources(pid), enabled: !!pid });
  const readings = useQuery({ queryKey: ['health-readings', pid], queryFn: () => healthApi.readings(pid), enabled: !!pid });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['health-sources', pid] });
    void qc.invalidateQueries({ queryKey: ['health-readings', pid] });
  };
  const [asking, setAsking] = useState(false);
  const mock = sources.data?.find((s) => s.providerType === 'MOCK');
  const connect = useMutation({ mutationFn: () => healthApi.connect(pid, { providerType: 'MOCK', deviceName: 'Mock Wearable' }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const revoke = useMutation({ mutationFn: () => healthApi.revoke(pid, 'MOCK'), onSuccess: () => { toast.success('Access removed. No further readings will be collected.'); refresh(); } });
  const sync = useMutation({ mutationFn: () => healthApi.sync(pid, 'MOCK'), onSuccess: (r) => { toast.success(`${r.length} new reading${r.length === 1 ? '' : 's'} received.`); refresh(); } });
  async function saveEstimate(bpm: number) {
    try {
      const cam = sources.data?.find((s) => s.providerType === 'CAMERA_PPG_DEMO');
      if (cam?.permissionStatus !== 'GRANTED') await healthApi.connect(pid, { providerType: 'CAMERA_PPG_DEMO', deviceName: 'Phone camera (demo)', clientReportedStatus: 'GRANTED' });
      await healthApi.ingest(pid, 'CAMERA_PPG_DEMO', [{ bpm, measuredAt: new Date().toISOString(), externalId: `ppg-${Date.now()}`, context: 'RESTING' }]);
      toast.success('Saved as a wellness estimate.');
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <div className="page stack">
      <PageHeader title="Health data" subtitle="Share heart-rate readings from a connected device with your care team." docTitle="Health data" />
      <Alert tone="info" live={false}>
        Readings are shared only after you give permission, and you can remove access at any time. A reading outside the usual range is flagged for review by a qualified healthcare professional — it is not a diagnosis. For severe or emergency symptoms, call 112.
      </Alert>
      <section className="card stack-sm" aria-labelledby="dev-h">
        <h2 id="dev-h">Mock Wearable (demo device)</h2>
        <p className="small muted">In production this connects to Apple Health, Android Health Connect or an approved device through the mobile app.</p>
        <p>
          Status: <strong>{mock?.permissionStatus === 'GRANTED' ? 'Connected' : mock?.permissionStatus === 'REVOKED' ? 'Access removed' : mock?.permissionStatus === 'DENIED' ? 'Permission denied' : 'Not connected'}</strong>
          {mock?.lastSyncAt ? ` · last synced ${formatDateTime(mock.lastSyncAt)}` : ''}
        </p>
        {sync.isError ? <Alert tone="error">{errorMessage(sync.error)}</Alert> : null}
        <div className="button-row">
          {mock?.permissionStatus === 'GRANTED' ? (
            <>
              <Button variant="primary" icon="refresh" loading={sync.isPending} onClick={() => sync.mutate()}>
                Sync now
              </Button>
              <Button variant="ghost" onClick={() => revoke.mutate()}>
                Remove access
              </Button>
            </>
          ) : (
            <Button variant="primary" icon="heart" loading={connect.isPending} onClick={() => setAsking(true)}>
              Connect Mock Wearable
            </Button>
          )}
        </div>
      </section>
      <section className="card stack-sm" aria-labelledby="read-h">
        <h2 id="read-h">Recent readings</h2>
        <QueryState query={readings} isEmpty={(d) => !d.length} emptyTitle="No readings yet">
          {(list) => (
            <ul className="list">
              {list.map((r) => (
                <ReadingRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </QueryState>
      </section>
      <CameraPpgDemo onResult={saveEstimate} />
      <ConfirmationDialog
        open={asking}
        title="Allow access to heart-rate data?"
        message="Mock Wearable (demo) will share heart-rate readings with your care team. You can remove access at any time."
        confirmLabel="Allow access"
        cancelLabel="Don’t allow"
        loading={connect.isPending}
        onConfirm={() => connect.mutate(undefined, { onSettled: () => setAsking(false) })}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
