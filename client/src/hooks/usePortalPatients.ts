import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { patientsApi } from '../api/patients';
import { useRequiredUser } from './useAuth';

/** Self + active dependents the signed-in patient may act for, with a current selection. */
export function usePortalPatients() {
  const user = useRequiredUser();
  const deps = useQuery({ queryKey: ['dependents'], queryFn: patientsApi.dependents });
  const options = [
    ...(user.patientId ? [{ id: user.patientId, label: `${user.displayName} (me)` }] : []),
    ...(deps.data ?? []).filter((d) => d.status === 'ACTIVE').map((d) => ({ id: d.patient.id, label: `${d.patient.fullName} (${d.relationship.toLowerCase().replace(/_/g, ' ')})` })),
  ];
  const [selected, setSelected] = useState<string | null>(null);
  const patientId = selected ?? user.patientId ?? options[0]?.id ?? null;
  return { options, patientId, setPatientId: setSelected, isLoading: deps.isLoading };
}
