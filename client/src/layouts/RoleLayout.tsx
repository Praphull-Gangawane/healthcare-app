import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';
import { AccessDenied } from '../pages/public/AccessDeniedPage';
import { hasRole } from '../utils/roles';
import { AREAS } from './navigation';
import { readCsrfToken } from '../api/client';

/** Guards an area by role (UX only — the API enforces authorization) and renders the shell. */
export function RoleLayout({ area }: { area: keyof typeof AREAS }) {
  const cfg = AREAS[area];
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (!cfg) return null;
  if (isLoading) {
    return (
      <div style={{ padding: 32 }}>
        <LoadingSkeleton lines={4} label="Checking your session…" />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    // A leftover CSRF cookie means there was a session that is no longer valid.
    const expired = readCsrfToken() !== null ? 'expired=1&' : '';
    return <Navigate to={`/login?${expired}next=${next}`} replace />;
  }
  return (
    <AppShell nav={hasRole(user, cfg.roles) ? cfg.nav : []} navLabel={cfg.navLabel} homeHref={cfg.home} roleText={cfg.roleText} profileHref={cfg.profileHref}>
      {hasRole(user, cfg.roles) ? <Outlet /> : <AccessDenied />}
    </AppShell>
  );
}
