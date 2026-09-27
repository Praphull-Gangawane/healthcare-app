import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { Icon } from './Icon';
import { UserMenu } from './UserMenu';

export function TopBar({ homeHref, roleText, onToggleMenu, menuOpen, profileHref, extra }: { homeHref: string; roleText?: string; onToggleMenu?: () => void; menuOpen?: boolean; profileHref?: string; extra?: ReactNode }) {
  return (
    <div className="topbar">
      {onToggleMenu ? (
        <button type="button" className="btn btn-ghost btn-icon menu-toggle" onClick={onToggleMenu} aria-expanded={menuOpen} aria-controls="app-sidebar" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
      ) : null}
      <Brand to={homeHref} />
      {roleText ? <span className="topbar-role">{roleText}</span> : null}
      <span className="topbar-spacer" />
      {extra}
      <UserMenu profileHref={profileHref} />
    </div>
  );
}
