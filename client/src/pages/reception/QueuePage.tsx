import { FacilityDoctorPicker } from '../../components/FacilityDoctorPicker';
import { PageHeader } from '../../components/PageHeader';
import { QueuePanel } from '../../components/QueuePanel';
import { useFacilityDoctors } from '../../hooks/useFacilityDoctors';

export function QueuePage() {
  const fd = useFacilityDoctors();
  return (
    <div className="page stack">
      <PageHeader title="Queue" subtitle="Call, skip, re-call or move patients. The public display shows token numbers only." docTitle="Queue" />
      <section className="card">
        <FacilityDoctorPicker facilities={fd.facilities} facilityId={fd.facilityId} onFacility={fd.setFacilityId} doctors={fd.doctors} doctorId={fd.doctorId} onDoctor={fd.setDoctorId} />
      </section>
      {fd.doctorId && fd.facilityId ? (
        <section className="card">
          <QueuePanel doctorId={fd.doctorId} facilityId={fd.facilityId} manage doctors={fd.doctors} />
        </section>
      ) : null}
    </div>
  );
}
