import type { Vital } from '../types/domain';
import { formatDateTime } from '../utils/format';
import { measurementFlagLabel, vitalTypeLabel } from '../utils/labels';
import { vitalValueText } from '../utils/vitals';
import { Alert } from './Alert';
import { StatusBadge } from './StatusBadge';

const DEFAULT_REVIEW = 'This measurement is outside the configured reference range. Please review the result with a qualified healthcare professional.';

const SOURCE_LABEL: Record<string, string> = { MANUAL: 'Recorded by staff', DEVICE: 'Device', HEALTH_PLATFORM: 'Health platform', PATIENT_REPORTED: 'Patient reported', DEMO_ESTIMATE: 'Demo estimate' };

/** One measurement with its review flag. Wording never implies a diagnosis. */
export function VitalCard({ vital, showGuidance = true }: { vital: Vital; showGuidance?: boolean }) {
  const flagged = vital.flag === 'REQUIRES_REVIEW' || vital.flag === 'URGENT_REVIEW';
  return (
    <article className="card card-tight vital-card" data-testid="vital-card" data-type={vital.type} data-flag={vital.flag}>
      <p className="stat-label">{vitalTypeLabel[vital.type]}</p>
      <p className="reading-value">
        {vitalValueText(vital)} <span className="small muted">{vital.unit}</span>
      </p>
      {vital.flag !== 'NOT_EVALUATED' ? <StatusBadge status={vital.flag} label={measurementFlagLabel[vital.flag]} /> : null}
      <p className="small muted" style={{ margin: 0 }}>
        {SOURCE_LABEL[vital.source] ?? vital.source}
        {vital.deviceName ? ` · ${vital.deviceName}` : ''} · {formatDateTime(vital.measuredAt)}
      </p>
      {showGuidance && flagged ? (
        <Alert tone={vital.flag === 'URGENT_REVIEW' ? 'error' : 'warning'} live={false}>
          {vital.guidance?.message ?? DEFAULT_REVIEW}
          {vital.guidance?.emergencyMessage ? <strong> {vital.guidance.emergencyMessage}</strong> : null}
        </Alert>
      ) : null}
    </article>
  );
}
