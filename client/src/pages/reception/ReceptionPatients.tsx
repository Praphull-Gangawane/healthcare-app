import { useNavigate } from 'react-router-dom';
import { ButtonLink } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { PatientSearch } from '../../components/PatientSearch';

export function ReceptionPatients() {
  const navigate = useNavigate();
  return (
    <div className="page stack">
      <PageHeader title="Find patient" docTitle="Find patient" actions={<ButtonLink to="/reception/register" variant="primary" icon="plus">Register patient</ButtonLink>} />
      <section className="card">
        <PatientSearch onSelect={(p) => navigate(`/reception/patients/${p.id}`)} />
      </section>
    </div>
  );
}
