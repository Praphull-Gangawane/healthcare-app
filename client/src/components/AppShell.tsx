import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { DemoBanner, OfflineBanner } from './Banners';
import { MedicalDisclaimer } from './MedicalDisclaimer';
import { Sidebar, type NavSection } from './Sidebar';
import { TopBar } from './TopBar';

export function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Skip to main content
    </a>
  );
}

/** Keeps --app-header-h in sync with the sticky header so other sticky elements sit below it. */
export function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const set = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

/** Authenticated layout: skip link, banners, top bar, role navigation, main landmark, disclaimer footer. */
export function AppShell({ nav, navLabel, homeHref, roleText, profileHref, children }: { nav: NavSection[]; navLabel: string; homeHref: string; roleText?: string; profileHref?: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const headerRef = useHeaderHeight();
  const [navPath, setNavPath] = useState(location.pathname);
  if (navPath !== location.pathname) {
    setNavPath(location.pathname);
    setMenuOpen(false);
  }
  return (
    <div className="app-shell">
      <SkipLink />
      <header className="app-header" ref={headerRef}>
        <DemoBanner />
        <OfflineBanner />
        <TopBar homeHref={homeHref} roleText={roleText} onToggleMenu={() => setMenuOpen((o) => !o)} menuOpen={menuOpen} profileHref={profileHref} />
      </header>
      <div className="app-shell-body">
        <Sidebar sections={nav} open={menuOpen} onNavigate={() => setMenuOpen(false)} label={navLabel} />
        <div className="app-content">
          <main className="app-main" id="main-content" tabIndex={-1}>
            <div className="page">{children}</div>
          </main>
          <MedicalDisclaimer />
        </div>
      </div>
    </div>
  );
}
