import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { ConfigContext, DEFAULT_CONFIG } from './contexts';

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data, isSuccess } = useQuery({ queryKey: ['config'], queryFn: authApi.config, staleTime: Infinity, retry: 1 });
  const value = useMemo(() => {
    const config = data ?? DEFAULT_CONFIG;
    const envName = import.meta.env.VITE_APP_NAME?.trim();
    return { config, appName: envName || config.appName || DEFAULT_CONFIG.appName, isLoaded: isSuccess };
  }, [data, isSuccess]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
