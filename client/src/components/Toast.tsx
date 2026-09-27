import type { ToastItem } from '../store/contexts';
import { Icon } from './Icon';

const ICON = { success: 'checkCircle', error: 'xCircle', info: 'info' } as const;

/** Toasts live in a persistent polite live region so screen readers announce them. */
export function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions" role="status">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} data-testid="toast" data-tone={t.tone}>
          <Icon name={ICON[t.tone]} />
          <p className="toast-message" style={{ margin: 0 }}>
            <span className="visually-hidden">{t.tone === 'error' ? 'Error: ' : t.tone === 'success' ? 'Success: ' : ''}</span>
            {t.message}
          </p>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
