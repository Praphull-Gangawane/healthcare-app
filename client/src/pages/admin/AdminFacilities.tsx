import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';

export function AdminFacilities() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'facilities'], queryFn: adminApi.facilities });
  const [dept, setDept] = useState<Record<string, { name: string; code: string }>>({});
  const add = useMutation({ mutationFn: (facilityId: string) => adminApi.createDepartment({ facilityId, name: dept[facilityId]?.name ?? '', code: dept[facilityId]?.code ?? '' }), onSuccess: () => { toast.success('Department added.'); void qc.invalidateQueries({ queryKey: ['admin', 'facilities'] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <PageHeader title="Facilities" docTitle="Facilities" />
      <QueryState query={q}>
        {(list) => (
          <div className="stack">
            {list.map((f) => (
              <section key={f.id} className="card stack-sm">
                <h2>
                  {f.name} <span className="small muted">· {f.type.replace(/_/g, ' ').toLowerCase()} · {f.code}</span>
                </h2>
                <p className="small">{f.address ? `${f.address.line1}, ${f.address.city}, ${f.address.state}` : ''}</p>
                <p className="small">
                  <strong>Departments:</strong> {f.departments.map((d) => d.name).join(', ')}
                </p>
                <p className="small">
                  <strong>Rooms:</strong> {f.rooms.map((r) => r.name).join(', ')}
                </p>
                <div className="form-grid">
                  <TextField label="New department name" value={dept[f.id]?.name ?? ''} onChange={(e) => setDept({ ...dept, [f.id]: { name: e.target.value, code: dept[f.id]?.code ?? '' } })} />
                  <TextField label="Code" value={dept[f.id]?.code ?? ''} onChange={(e) => setDept({ ...dept, [f.id]: { name: dept[f.id]?.name ?? '', code: e.target.value.toUpperCase() } })} />
                </div>
                <div>
                  <Button size="sm" variant="secondary" disabled={!dept[f.id]?.name || !dept[f.id]?.code} onClick={() => add.mutate(f.id)}>
                    Add department
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
