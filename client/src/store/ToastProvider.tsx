import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastViewport } from '../components/Toast';
import { ToastContext, type ToastItem, type ToastTone } from './contexts';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 6000);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({ notify, success: (m: string) => notify(m, 'success'), error: (m: string) => notify(m, 'error') }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
