import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { directoryApi } from '../../api/directory';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useConfig } from '../../hooks/useConfig';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function HomePage() {
  const { appName } = useConfig();
  useDocumentTitle(`${appName} — Book appointments and manage your care`);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => directoryApi.departments() });
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: directoryApi.facilities });
  const uniqueDepts = [...new Map((departments.data ?? []).map((d) => [d.name, d])).values()];
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">{appName}</p>
          <h1>Care that fits your day</h1>
          <p className="hero-lead">Find a doctor, book a time that suits you, and keep your prescriptions and reports in one secure place.</p>
          <form
            className="hero-panel"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/doctors${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
            }}
          >
            <label htmlFor="home-search">Search by doctor name or speciality</label>
            <div className="toolbar">
              <input id="home-search" className="input" type="search" placeholder="e.g. General Physician" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button type="submit" variant="primary" icon="search">
                Find a doctor
              </Button>
            </div>
          </form>
        </div>
        <div className="hero-art" aria-hidden="true">
          <Icon name="stethoscope" size={96} />
        </div>
      </section>

      <section aria-labelledby="dept-heading" className="stack-sm">
        <h2 id="dept-heading">Browse departments</h2>
        <ul className="dept-links chip-row">
          {uniqueDepts.map((d) => (
            <li key={d.id}>
              <Link className="chip" to={`/doctors?department=${encodeURIComponent(d.name)}`}>
                {d.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="grid-3">
        <h2 id="how-heading" className="visually-hidden">
          How it works
        </h2>
        {[
          { icon: 'calendar' as const, title: 'Book in minutes', text: 'See real availability and confirm instantly. You get a confirmation by SMS or WhatsApp if you opt in.' },
          { icon: 'pill' as const, title: 'Prescriptions & reports', text: 'Your doctor’s prescriptions and released test reports are available in your secure portal.' },
          { icon: 'users' as const, title: 'Family profiles', text: 'Manage appointments for your children or relatives you care for, with their permission.' },
        ].map((f) => (
          <article key={f.title} className="card">
            <span className="feature-icon" aria-hidden="true">
              <Icon name={f.icon} />
            </span>
            <h3>{f.title}</h3>
            <p className="muted">{f.text}</p>
          </article>
        ))}
      </section>

      {facilities.data?.length ? (
        <section aria-labelledby="fac-heading" className="stack-sm">
          <h2 id="fac-heading">Our locations</h2>
          <ul className="grid-3">
            {facilities.data.map((f) => (
              <li key={f.id} className="card card-tight">
                <h3>{f.name}</h3>
                <p className="small muted">{f.address ? `${f.address.line1}, ${f.address.city}` : ''}</p>
                <p className="small">{f.departments.map((d) => d.name).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
