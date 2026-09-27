import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** role="alertdialog" for confirmations */
  alert?: boolean;
  describedBy?: string;
  closeLabel?: string;
}

export function Modal({ open, title, onClose, children, footer, size = 'md', alert, describedBy, closeLabel = 'Close dialog' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = `m${useId().replace(/:/g, '')}`;
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
