import { useEffect, useState } from 'react';
import { subscribeNetworkStatus } from '../api/client';

/** Offline when the browser reports offline OR the last API call failed at the network level. */
export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const unsub = subscribeNetworkStatus(setReachable);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      unsub();
    };
  }, []);

  return { online: browserOnline && reachable, browserOnline, reachable };
}
