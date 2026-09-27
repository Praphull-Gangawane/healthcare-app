import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { directoryApi } from '../../api/directory';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../hooks/useToast';
import type { RoleKey } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { roleLabel } from '../../utils/labels';

const STAFF_ROLES: RoleKey[] = ['HOSPITAL_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'PHARMACIST', 'ACCOUNTANT'];

export function AdminUsers() {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => adminApi.users() });
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: directoryApi.facilities });
  const [v, setV] = useState({ email: '', displayName: '', password: '', role: 'RECEPTIONIST' as RoleKey, facilityId: '' });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const create = useMutation({ mutationFn: () => adminApi.createUser({ email: v.email, displayName: v.displayName, password: v.password, roles: [{ role: v.role, ...(v.facilityId ? { facilityId: v.facilityId } : {}) }] }), onSuccess: () => { toast.success('User created.'); setV({ ...v, email: '', displayName: '', password: '' }); refresh(); } });
  const status = useMutation({ mutationFn: ({ id, s }: { id: string; s: 'ACTIVE' | 'DISABLED' }) => adminApi.setUserStatus(id, s), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const facilityName = (id: string | null) => (id ? (facilities.data?.find((f) => f.id === id)?.name ?? id) : 'All facilities');
  return (
    <div className="page stack">
      <PageHeader title="Users & roles" subtitle="Grant least-privilege roles scoped to a facility where possible." docTitle="Users & roles" />
      <QueryState query={users}>
        {(list) => (
          <DataTable
            caption="Staff users"
            rows={list}
            rowKey={(u) => u.id}
            columns={[
              { key: 'n', header: 'Name', rowHeader: true, render: (u) => u.displayName },
              { key: 'e', header: 'Email', render: (u) => u.email },
              { key: 'r', header: 'Roles', render: (u) => u.roles.map((r) => `${roleLabel[r.role.key] ?? r.role.key} (${facilityName(r.facilityId)})`).join(', ') },
              { key: 'l', header: 'Last sign-in', render: (u) => formatDateTime(u.lastLoginAt) },
              { key: 's', header: 'Status', render: (u) => <StatusBadge status={u.status} label={u.status === 'ACTIVE' ? 'Active' : u.status === 'LOCKED' ? 'Locked' : 'Disabled'} /> },
              { key: 'a', header: 'Actions', render: (u) => <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: u.id, s: u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' })}>{u.status === 'DISABLED' ? 'Enable' : 'Disable'}</Button> },
            ]}
          />
        )}
      </QueryState>
      <form className="card stack-sm" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <h2>Add staff user</h2>
        {create.isError ? <Alert tone="error">{errorMessage(create.error)}</Alert> : null}
        <div className="form-grid">
          <TextField label="Full name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
          <TextField label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <TextField label="Temporary password" type="password" hint="10+ characters with upper, lower and a number" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          <SelectField label="Role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as RoleKey })} options={STAFF_ROLES.map((r) => ({ value: r, label: roleLabel[r] ?? r }))} />
          <SelectField label="Facility scope" value={v.facilityId} onChange={(e) => setV({ ...v, facilityId: e.target.value })} options={[{ value: '', label: 'All facilities' }, ...(facilities.data ?? []).map((f) => ({ value: f.id, label: f.name }))]} />
        </div>
        <div>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create user
          </Button>
        </div>
      </form>
    </div>
  );
}
