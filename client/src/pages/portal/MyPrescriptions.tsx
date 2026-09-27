import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { prescriptionsApi } from '../../api/clinical';
import { PageHeader } from '../../components/PageHeader';
import { PatientPicker } from '../../components/PatientPicker';
import { QueryState } from '../../components/QueryState';
import { usePortalPatients } from '../../hooks/usePortalPatients';
import { formatDate, formatDateOnly } from '../../utils/format';

export function MyPrescriptions() {
  const { options, patientId, setPatientId } = usePortalPatients();
  const q = useQuery({ queryKey: ['prescriptions', patientId], queryFn: () => prescriptionsApi.listForPatient(patientId ?? ''), enabled: !!patientId });
  return (
    <div className="page stack">
      <PageHeader title="Prescriptions" subtitle="Prescriptions finalized by your doctors." docTitle="Prescriptions" />
      <PatientPicker options={options} value={patientId} onChange={setPatientId} />
      <QueryState query={q} isEmpty={(d) => !d.length} emptyTitle="No prescriptions yet">
        {(list) => (
          <ul className="list">
            {list.map((r) => (
              <li key={r.id} className="list-item" data-testid="prescription-row">
                <div className="list-item-main">
                  <Link className="list-item-title" to={`/portal/prescriptions/${r.id}`}>
                    {formatDate(r.finalizedAt ?? r.createdAt)} · {r.doctor.displayName}
                  </Link>
                  <p className="list-item-meta">
                    {r.prescriptionNumber} · {r.items.length} medicine{r.items.length === 1 ? '' : 's'}
                    {r.currentVersion > 1 ? ` · version ${r.currentVersion}` : ''}
                    {r.followUpDate ? ` · follow-up ${formatDateOnly(r.followUpDate)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
