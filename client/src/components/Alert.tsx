import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'error';
const ICONS: Record<Tone, IconName> = { info: 'info', success: 'checkCircle', warning: 'alert', error: 'xCircle' };

/** Inline message. Errors use role="alert"; others are polite status messages. */
export function Alert({ tone = 'info', title, children, className, live = true, testId }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; live?: boolean; testId?: string }) {
  const role = !live ? undefined : tone === 'error' ? 'alert' : 'status';
  return (
    <div className={`alert alert-${tone} ${className ?? ''}`} role={role} data-testid={testId}>
      <Icon name={ICONS[tone]} />
      <div className="alert-body">
        {title ? <strong className="alert-title">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
