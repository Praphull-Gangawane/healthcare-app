import { useContext } from 'react';
import { AuthContext } from '../store/contexts';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user; only call inside a guarded route. */
export function useRequiredUser() {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user;
}
