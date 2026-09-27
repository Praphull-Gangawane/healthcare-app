import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { directoryApi } from '../../api/directory';
import { DoctorCard } from '../../components/DoctorCard';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { QueryState } from '../../components/QueryState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AppointmentType } from '../../types/domain';
import { appointmentTypeLabel } from '../../utils/labels';

export function DoctorsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const department = params.get('department') ?? '';
  const language = params.get('language') ?? '';
  const facilityId = params.get('facilityId') ?? '';
  const type = (params.get('type') ?? '') as AppointmentType | '';
  const page = Number(params.get('page') ?? '1');
  const term = useDebouncedValue(q, 300);
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => directoryApi.departments() });
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: directoryApi.facilities });
  const deptIds = (departments.data ?? []).filter((d) => d.name === department).map((d) => d.id);
  const doctors = useQuery({
    queryKey: ['doctors', term, deptIds.join(','), language, facilityId, type, page],
    queryFn: () => directoryApi.doctors({ q: term || undefined, departmentId: deptIds[0], language: language || undefined, facilityId: facilityId || undefined, consultationType: type, page, withNextSlot: true }),
    enabled: !department || departments.isSuccess,
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const deptNames = [...new Set((departments.data ?? []).map((d) => d.name))];
  return (
    <div className="page">
      <PageHeader title="Find a doctor" subtitle="Search by name or speciality and filter by department, language or visit type." docTitle="Find a doctor" />
      <form className="card form-grid" role="search" aria-label="Filter doctors" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor="f-q">Doctor or speciality</label>
          <input id="f-q" className="input" type="search" value={q} onChange={(e) => set('q', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="f-dept">Department</label>
          <select id="f-dept" className="select" value={department} onChange={(e) => set('department', e.target.value)}>
            <option value="">All departments</option>
            {deptNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-fac">Location</label>
          <select id="f-fac" className="select" value={facilityId} onChange={(e) => set('facilityId', e.target.value)}>
            <option value="">All locations</option>
            {facilities.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-lang">Language</label>
          <select id="f-lang" className="select" value={language} onChange={(e) => set('language', e.target.value)}>
            <option value="">Any language</option>
            {['English', 'Hindi', 'Marathi', 'Tamil', 'Kannada', 'Telugu', 'Malayalam', 'Bengali', 'Gujarati', 'Urdu'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-type">Visit type</label>
          <select id="f-type" className="select" value={type} onChange={(e) => set('type', e.target.value)}>
            <option value="">Any</option>
            {(['IN_PERSON', 'TELECONSULTATION', 'FOLLOW_UP'] as AppointmentType[]).map((t) => (
              <option key={t} value={t}>
                {appointmentTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
      </form>
      <QueryState query={doctors} isEmpty={(d) => d.items.length === 0} emptyTitle="No doctors match your search" emptyMessage="Try removing a filter or searching for a speciality." loadingLabel="Finding doctors…">
        {(d) => (
          <>
            <p className="muted" aria-live="polite">
              {d.meta.total} doctor{d.meta.total === 1 ? '' : 's'} found
            </p>
            <div className="grid-auto">
              {d.items.map((doc) => (
                <DoctorCard key={doc.id} doctor={doc} />
              ))}
            </div>
            <Pagination meta={d.meta} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </QueryState>
    </div>
  );
}
