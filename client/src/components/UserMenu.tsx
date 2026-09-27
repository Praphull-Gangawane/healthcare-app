import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { initials } from '../utils/format';
import { roleLabel } from '../utils/labels';
import { Icon } from './Icon';

export function UserMenu({ profileHref }: { profileHref?: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = `um${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const primaryRole = user.roles[0];
  return (
    <div className="user-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="user-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        data-testid="user-menu"
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.displayName)}
        </span>
        <span className="user-menu-name">{user.displayName}</span>
        <span className="visually-hidden">Account menu</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open ? (
        <div className="user-menu-panel" role="menu" id={menuId} aria-label="Account" onKeyDown={onMenuKey}>
          <div className="menu-header">
            <strong>{user.displayName}</strong>
            <div className="muted small">
              {user.email}
              {primaryRole ? ` · ${roleLabel[primaryRole]}` : ''}
            </div>
          </div>
          {profileHref ? (
            <Link role="menuitem" className="menu-item" to={profileHref} onClick={() => setOpen(false)}>
              <Icon name="user" /> My profile
            </Link>
          ) : null}
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            data-testid="logout-button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            <Icon name="logout" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
