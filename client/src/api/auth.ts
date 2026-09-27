import { api } from './client';
import type { AppConfig, SessionUser } from '../types/domain';

export interface SessionResponse {
  user: SessionUser | null;
  csrfToken: string | null;
}

export const authApi = {
  config: () => api.get<AppConfig>('/config', undefined, { skipSessionRedirect: true }),
  me: () => api.get<SessionResponse>('/auth/me', undefined, { skipSessionRedirect: true }),
  login: (email: string, password: string) => api.post<SessionResponse>('/auth/login', { email, password }),
  register: (body: unknown) => api.post<SessionResponse>('/auth/register', body),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout', undefined, { skipSessionRedirect: true }),
};
