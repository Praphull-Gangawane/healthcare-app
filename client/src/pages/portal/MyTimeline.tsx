import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '../../api/patients';
import { PageHeader } from '../../components/PageHeader';
import { PatientPicker } from '../../components/PatientPicker';
import { PatientTimeline, TimelineFilters } from '../../components/PatientTimeline';
import { QueryState } from '../../components/QueryState';
import { usePortalPatients } from '../../hooks/usePortalPatients';
import type { TimelineType } from '../../types/domain';

export function MyTimeline() {
  const { options, patientId, setPatientId } = usePortalPatients();
  const [types, setTypes] = useState<TimelineType[]>([]);
  const q = useQuery({ queryKey: ['timeline', patientId, types.join(',')], queryFn: () => patientsApi.timeline(patientId ?? '', types.length ? types : undefined), enabled: !!patientId });
  return (
    <div className="page stack">
      <PageHeader title="Medical timeline" subtitle="Your visits, prescriptions, reports and measurements over time." docTitle="Medical timeline" />
      <PatientPicker options={options} value={patientId} onChange={setPatientId} />
      <TimelineFilters selected={types} onChange={setTypes} />
      <QueryState query={q}>{(items) => <PatientTimeline items={items} linkFor={(i) => (i.type === 'PRESCRIPTION' ? `/portal/prescriptions/${i.refId}` : i.type === 'LAB' || i.type === 'IMAGING' ? '/portal/reports' : null)} />}</QueryState>
    </div>
  );
}
