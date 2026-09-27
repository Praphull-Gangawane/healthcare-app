import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { PatientSearch } from '../../components/PatientSearch';

export function DoctorPatientSearch() {
  const navigate = useNavigate();
  return (
    <div className="page stack">
      <PageHeader title="Find patient" subtitle="You can open clinical records of patients under your care. Other records need an audited emergency-access reason." docTitle="Find patient" />
      <section className="card">
        <PatientSearch onSelect={(p) => navigate(`/doctor/patients/${p.id}`)} />
      </section>
    </div>
  );
}
