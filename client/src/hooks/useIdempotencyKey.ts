import { useCallback } from 'react';
import { ApiError } from '../api/client';
import { readSession, writeSession } from '../utils/storage';

const STORE = 'idem-keys';

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stable Idempotency-Key per user action. The same scope (e.g. "finalize:rx_123") reuses its key
 * until the server answers, so a retry after a network failure cannot create a duplicate record.
 * Keys persist in sessionStorage so a reload after reconnecting still reuses them.
 */
export function useIdempotencyKey() {
  const keyFor = useCallback((scope: string) => {
    const all = readSession<Record<string, string>>(STORE) ?? {};
    const existing = all[scope];
    if (existing) return existing;
    const key = newKey();
    writeSession(STORE, { ...all, [scope]: key });
    return key;
  }, []);

  const release = useCallback((scope: string) => {
    const all = readSession<Record<string, string>>(STORE) ?? {};
    if (!(scope in all)) return;
    const { [scope]: _drop, ...rest } = all;
    void _drop;
    writeSession(STORE, rest);
  }, []);

  /** Runs `fn` with the scope's key; keeps the key only when the request may not have reached the server. */
  const run = useCallback(
    async <T,>(scope: string, fn: (key: string) => Promise<T>): Promise<T> => {
      const key = keyFor(scope);
      try {
        const out = await fn(key);
        release(scope);
        return out;
      } catch (err) {
        const retryable = err instanceof ApiError && (err.isNetwork || err.status >= 500 || err.code === 'REQUEST_IN_PROGRESS');
        if (!retryable) release(scope);
        throw err;
      }
    },
    [keyFor, release],
  );

  return { keyFor, release, run };
}
