import { useId, type ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Alert } from './Alert';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmationDialog({ open, title, message, confirmLabel, cancelLabel = 'Go back', tone = 'primary', loading, error, confirmDisabled, onConfirm, onCancel, children }: ConfirmationDialogProps) {
  const descId = `c${useId().replace(/:/g, '')}`;
  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? () => undefined : onCancel}
      alert
      describedBy={descId}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div id={descId}>{typeof message === 'string' ? <p>{message}</p> : message}</div>
      {children}
      {error ? (
        <Alert tone="error" className="form-alert">
          {error}
        </Alert>
      ) : null}
    </Modal>
  );
}
