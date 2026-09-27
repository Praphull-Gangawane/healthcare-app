import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Icon } from './Icon';

export function PageHeader({ title, subtitle, actions, back, docTitle }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; docTitle?: string }) {
  useDocumentTitle(docTitle ?? (typeof title === 'string' ? title : ''));
  return (
    <>
      {back ? (
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={back.to}>
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </Link>
        </nav>
      ) : null}
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </header>
    </>
  );
}
