import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, type SessionResponse } from '../api/auth';
import { onSessionExpired } from '../api/client';
import type { SessionUser } from '../types/domain';
import { AuthContext } from './contexts';

const ME_KEY = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<SessionResponse> => {
      try {
        return await authApi.me();
      } catch {
        return { user: null, csrfToken: null };
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const user = data?.user ?? null;
  const userRef = useRef<SessionUser | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const setSessionUser = useCallback(
    (next: SessionUser | null) => {
      qc.setQueryData<SessionResponse>(ME_KEY, { user: next, csrfToken: null });
    },
    [qc],
  );

  useEffect(() => {
    onSessionExpired(() => {
      if (!userRef.current) return;
      const here = locationRef.current;
      const next = encodeURIComponent(`${here.pathname}${here.search}`);
      qc.clear();
      qc.setQueryData<SessionResponse>(ME_KEY, { user: null, csrfToken: null });
      navigate(`/login?expired=1&next=${next}`, { replace: true });
    });
    return () => onSessionExpired(null);
  }, [navigate, qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' && q.queryKey[0] !== 'auth' });
      setSessionUser(res.user);
      return res.user;
    },
    [qc, setSessionUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* already signed out */
    }
    qc.clear();
    setSessionUser(null);
    navigate('/login', { replace: true });
  }, [navigate, qc, setSessionUser]);

  const value = useMemo(() => ({ user, isLoading, login, logout, setSessionUser }), [user, isLoading, login, logout, setSessionUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
