import { createContext } from 'react';
import type { AppConfig, SessionUser } from '../types/domain';

export interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<SessionUser | null>;
  setSessionUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface ConfigContextValue {
  config: AppConfig;
  appName: string;
  isLoaded: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'CareFlow',
  demoMode: false,
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  emergencyNumber: '112',
};

export const ConfigContext = createContext<ConfigContextValue>({ config: DEFAULT_CONFIG, appName: DEFAULT_CONFIG.appName, isLoaded: false });

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
