import { NavLink, Outlet } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { DemoBanner, OfflineBanner } from '../components/Banners';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';
import { SkipLink, useHeaderHeight } from '../components/AppShell';
import { UserMenu } from '../components/UserMenu';
import { useAuth } from '../hooks/useAuth';
import { homeFor } from '../utils/roles';

export function PublicLayout() {
  const { user } = useAuth();
  const headerRef = useHeaderHeight();
  return (
    <div className="public-shell">
      <SkipLink />
      <header className="app-header public-header" ref={headerRef}>
        <DemoBanner />
        <OfflineBanner />
        <div className="topbar">
          <Brand />
          <span className="topbar-spacer" />
          <nav className="public-nav" aria-label="Main">
            <NavLink to="/doctors">Find a doctor</NavLink>
            {user ? (
              <NavLink to={homeFor(user)} className="hide-sm">
                My dashboard
              </NavLink>
            ) : (
              <>
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/register" className="hide-sm">
                  Create account
                </NavLink>
              </>
            )}
          </nav>
          {user ? <UserMenu /> : null}
        </div>
      </header>
      <main id="main-content" className="public-main" tabIndex={-1}>
        <Outlet />
      </main>
      <MedicalDisclaimer />
    </div>
  );
}
