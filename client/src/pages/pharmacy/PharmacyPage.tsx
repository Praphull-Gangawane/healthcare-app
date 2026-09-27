import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prescriptionsApi } from '../../api/clinical';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PrescriptionView } from '../../components/PrescriptionView';
import { QueryState } from '../../components/QueryState';

/** Dispensing view: finalized prescriptions only (lookup by prescription reference). */
export function PharmacyPage() {
  const [input, setInput] = useState('');
  const [id, setId] = useState('');
  const q = useQuery({ queryKey: ['prescription', id], queryFn: () => prescriptionsApi.get(id), enabled: !!id, retry: false });
  return (
    <div className="page stack">
      <PageHeader title="Dispensing" subtitle="Enter the prescription reference from the patient’s secure link or printout." docTitle="Dispensing" />
      <form className="card toolbar" onSubmit={(e) => { e.preventDefault(); setId(input.trim()); }}>
        <div className="field">
          <label htmlFor="ph-id">Prescription reference</label>
          <input id="ph-id" className="input" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" icon="search">
          Open
        </Button>
      </form>
      {id ? <QueryState query={q}>{(rx) => (rx.current?.snapshot ? <PrescriptionView snapshot={rx.current.snapshot} /> : <p>Not finalized.</p>)}</QueryState> : null}
    </div>
  );
}
