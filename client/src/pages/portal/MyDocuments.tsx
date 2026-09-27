import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '../../api/documents';
import { FileUpload } from '../../components/FileUpload';
import { MedicalDocumentViewer } from '../../components/MedicalDocumentViewer';
import { PageHeader } from '../../components/PageHeader';
import { PatientPicker } from '../../components/PatientPicker';
import { QueryState } from '../../components/QueryState';
import { usePortalPatients } from '../../hooks/usePortalPatients';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';

export function MyDocuments() {
  const { options, patientId, setPatientId } = usePortalPatients();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['documents', patientId], queryFn: () => documentsApi.list(patientId ?? ''), enabled: !!patientId });
  const upload = useMutation({
    mutationFn: ({ file, title }: { file: File; title: string }) => documentsApi.upload({ patientId: patientId ?? '', file, ...(title ? { title } : {}) }),
    onSuccess: () => {
      toast.success('Document uploaded.');
      void qc.invalidateQueries({ queryKey: ['documents', patientId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="page stack">
      <PageHeader title="Documents" subtitle="Prescriptions, reports and letters, plus documents you share with your care team." docTitle="Documents" />
      <PatientPicker options={options} value={patientId} onChange={setPatientId} />
      <section className="card">
        <QueryState query={q}>{(docs) => <MedicalDocumentViewer documents={docs} />}</QueryState>
      </section>
      <section className="card stack-sm" aria-labelledby="up-h">
        <h2 id="up-h">Upload a document</h2>
        <FileUpload busy={upload.isPending} onUpload={(file, title) => upload.mutateAsync({ file, title }).then(() => undefined)} />
      </section>
    </div>
  );
}
