import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export function Sidebar({ sections, open, onNavigate, label }: { sections: NavSection[]; open: boolean; onNavigate: () => void; label: string }) {
  return (
    <>
      {open ? <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={onNavigate} /> : null}
      <aside className="sidebar" id="app-sidebar" data-open={open}>
        <nav className="sidebar-nav" aria-label={label}>
          {sections.map((s, i) => (
            <div key={s.label ?? i}>
              {s.label ? <p className="sidebar-section-label">{s.label}</p> : null}
              <ul>
                {s.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className="nav-link" onClick={onNavigate}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
