import { Icon, type IconName } from './Icon';

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent';

const TONE_ICON: Record<BadgeTone, IconName> = {
  success: 'checkCircle',
  warning: 'alert',
  error: 'xCircle',
  info: 'info',
  neutral: 'dot',
  accent: 'clock',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  CONFIRMED: 'success',
  BOOKED: 'success',
  COMPLETED: 'success',
  VERIFIED: 'success',
  FINALIZED: 'success',
  PAID: 'success',
  ACTIVE: 'success',
  GRANTED: 'success',
  DELIVERED: 'success',
  READ: 'success',
  SENT: 'info',
  WITHIN_RANGE: 'success',
  VALID: 'success',
  NORMAL: 'success',
  CHECKED_IN: 'info',
  WAITING: 'accent',
  CALLED: 'info',
  IN_CONSULTATION: 'info',
  IN_PROGRESS: 'info',
  PROCESSING: 'info',
  COLLECTED: 'info',
  ORDERED: 'neutral',
  SCHEDULED: 'neutral',
  HELD: 'warning',
  DRAFT: 'warning',
  PENDING: 'warning',
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  QUEUED: 'neutral',
  AMENDED: 'info',
  REQUIRES_REVIEW: 'warning',
  WELLNESS_ESTIMATE: 'warning',
  SKIPPED: 'warning',
  RECEIVED: 'neutral',
  IN_REVIEW: 'info',
  URGENT: 'error',
  STAT: 'error',
  ROUTINE: 'neutral',
  URGENT_REVIEW: 'error',
  CANCELLED: 'neutral',
  RESCHEDULED: 'neutral',
  NO_SHOW: 'error',
  ABSENT: 'error',
  FAILED: 'error',
  DENIED: 'error',
  REVOKED: 'neutral',
  INVALID: 'error',
  REJECTED: 'error',
  VOID: 'neutral',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
  TRANSFERRED: 'neutral',
  HIGH: 'warning',
  LOW: 'warning',
  ABNORMAL: 'warning',
  SUCCESS: 'success',
  FAILURE: 'error',
};

/** Status is always conveyed by icon shape + text, never by colour alone. */
export function StatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: BadgeTone; className?: string }) {
  const t = tone ?? STATUS_TONE[status] ?? 'neutral';
  const text = label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span className={`badge badge-${t} ${className ?? ''}`} data-testid="status-badge" data-status={status}>
      <Icon name={TONE_ICON[t]} />
      <span>{text}</span>
    </span>
  );
}
