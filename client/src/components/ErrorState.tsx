import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { errorMessage } from '../utils/errors';
import { Button } from './Button';
import { Icon } from './Icon';

/** Friendly failure block (never shows stack traces). Distinguishes unauthorized / unavailable / generic. */
export function ErrorState({ error, title, onRetry, action, headingLevel = 3 }: { error?: unknown; title?: string; onRetry?: () => void; action?: ReactNode; headingLevel?: 2 | 3 }) {
  const code = error instanceof ApiError ? error.code : null;
  const status = error instanceof ApiError ? error.status : 0;
  const heading =
    title ??
    (status === 403
      ? "You don't have access to this"
      : status === 404
        ? 'Not found'
        : code === 'NETWORK_ERROR' || status >= 500 || code === 'PROVIDER_UNAVAILABLE'
          ? 'Service unavailable'
          : "Something didn't work");
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="state-block error" role="alert" data-testid="error-state" data-code={code ?? undefined}>
      <span className="state-icon">
        <Icon name={status === 403 ? 'lock' : code === 'NETWORK_ERROR' ? 'wifiOff' : 'alertCircle'} />
      </span>
      <H>{heading}</H>
      <p>{errorMessage(error)}</p>
      <div className="button-row">
        {onRetry && status !== 403 ? (
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
