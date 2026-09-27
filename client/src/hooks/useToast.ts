import { useContext } from 'react';
import { ToastContext } from '../store/contexts';

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
