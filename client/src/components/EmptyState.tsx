import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({ title, message, icon = 'list', action, headingLevel = 3 }: { title: string; message?: ReactNode; icon?: IconName; action?: ReactNode; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="state-block" data-testid="empty-state">
      <span className="state-icon">
        <Icon name={icon} />
      </span>
      <H>{title}</H>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}
