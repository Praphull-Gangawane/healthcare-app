import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '../../api/billing';
import { directoryApi } from '../../api/directory';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import type { BillableService } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { formatMoney } from '../../utils/format';

export function AdminServices() {
  const qc = useQueryClient();
  const toast = useToast();
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: directoryApi.facilities });
  const [facilityId, setFacilityId] = useState('');
  const fid = facilityId || facilities.data?.[0]?.id || '';
  const services = useQuery({ queryKey: ['services', fid], queryFn: () => billingApi.services(fid), enabled: !!fid });
  const [v, setV] = useState({ code: '', name: '', category: 'CONSULTATION' as BillableService['category'], price: '', taxRatePct: '0' });
  const save = useMutation({ mutationFn: () => billingApi.upsertService({ facilityId: fid, ...v }), onSuccess: () => { toast.success('Service saved.'); void qc.invalidateQueries({ queryKey: ['services', fid] }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="page stack">
      <PageHeader title="Services & fees" docTitle="Services & fees" />
      <SelectField label="Facility" value={fid} onChange={(e) => setFacilityId(e.target.value)} options={(facilities.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
      <QueryState query={services}>
        {(list) => <DataTable caption="Billable services" rows={list} rowKey={(s) => s.id} columns={[{ key: 'c', header: 'Code', rowHeader: true, render: (s) => s.code }, { key: 'n', header: 'Name', render: (s) => s.name }, { key: 'k', header: 'Category', render: (s) => s.category }, { key: 'p', header: 'Price', numeric: true, render: (s) => formatMoney(s.price) }, { key: 't', header: 'Tax %', numeric: true, render: (s) => s.taxRatePct }]} />}
      </QueryState>
      <form className="card stack-sm" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2>Add or update a service</h2>
        <div className="form-grid">
          <TextField label="Code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
          <TextField label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <SelectField label="Category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as BillableService['category'] })} options={['CONSULTATION', 'DIAGNOSTIC', 'PROCEDURE', 'OTHER'].map((c) => ({ value: c, label: c.toLowerCase() }))} />
          <TextField label="Price (₹)" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
          <TextField label="Tax rate (%)" inputMode="decimal" value={v.taxRatePct} onChange={(e) => setV({ ...v, taxRatePct: e.target.value })} />
        </div>
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!v.code || !v.name || !v.price}>
            Save service
          </Button>
        </div>
      </form>
    </div>
  );
}
