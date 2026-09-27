import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vitalsApi } from '../../api/clinical';
import { Alert } from '../../components/Alert';
import { FacilityDoctorPicker } from '../../components/FacilityDoctorPicker';
import { PageHeader } from '../../components/PageHeader';
import { QueuePanel } from '../../components/QueuePanel';
import { VitalCard } from '../../components/VitalCard';
import { VitalsForm } from '../../components/VitalsForm';
import { useFacilityDoctors } from '../../hooks/useFacilityDoctors';
import { useToast } from '../../hooks/useToast';
import type { QueueTokenRow } from '../../types/domain';
import { errorMessage } from '../../utils/errors';
import { latestByType } from '../../utils/vitals';

export function NurseStation() {
  const fd = useFacilityDoctors();
  const qc = useQueryClient();
  const toast = useToast();
  const [patient, setPatient] = useState<QueueTokenRow['patient'] | null>(null);
  const vitals = useQuery({ queryKey: ['vitals', patient?.id], queryFn: () => vitalsApi.list(patient?.id ?? ''), enabled: !!patient });
  const record = useMutation({
    mutationFn: (m: Parameters<typeof vitalsApi.record>[1]) => vitalsApi.record(patient?.id ?? '', m),
    onSuccess: () => {
      toast.success('Vitals recorded.');
      void qc.invalidateQueries({ queryKey: ['vitals', patient?.id] });
    },
  });
  return (
    <div className="page stack">
      <PageHeader title="Queue & vitals" docTitle="Nursing station" />
      <section className="card">
        <FacilityDoctorPicker facilities={fd.facilities} facilityId={fd.facilityId} onFacility={fd.setFacilityId} doctors={fd.doctors} doctorId={fd.doctorId} onDoctor={fd.setDoctorId} />
      </section>
      <div className="grid-2">
        <section className="card">{fd.doctorId && fd.facilityId ? <QueuePanel doctorId={fd.doctorId} facilityId={fd.facilityId} manage onOpen={(t) => setPatient(t.patient)} /> : null}</section>
        <section className="card stack-sm" aria-labelledby="nv-h">
          <h2 id="nv-h">{patient ? `Vitals · ${patient.fullName} (${patient.uhid})` : 'Select a patient from the queue'}</h2>
          {patient ? (
            <>
              {record.isError ? <Alert tone="error">{errorMessage(record.error)}</Alert> : null}
              <VitalsForm busy={record.isPending} onSubmit={(m) => record.mutateAsync(m)} />
              <div className="vital-grid">
                {latestByType(vitals.data ?? []).map((v) => (
                  <VitalCard key={v.id} vital={v} />
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
