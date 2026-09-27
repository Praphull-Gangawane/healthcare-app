import { useState } from 'react';
import { documentsApi } from '../api/documents';
import type { MedicalDocument } from '../types/domain';
import { saveBlob } from '../utils/download';
import { errorMessage } from '../utils/errors';
import { formatBytes, formatDate } from '../utils/format';
import { documentTypeLabel } from '../utils/labels';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';

/** Opens documents through an authorised, short-lived URL. Files are never publicly linked. */
export function useDocumentOpener() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string; type: string } | null>(null);
  async function open(id: string, title: string, mode: 'view' | 'download' = 'view') {
    setBusy(id);
    setError(null);
    try {
      const file = await documentsApi.fetchFile(id);
      if (mode === 'download') saveBlob(file.blob, file.filename ?? title);
      else setPreview({ url: URL.createObjectURL(file.blob), title, type: file.contentType });
    } catch (err) {
      setError(errorMessage(err, "We couldn't open this document."));
    } finally {
      setBusy(null);
    }
  }
  function close() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }
  const viewer = (
    <Modal open={!!preview} title={preview?.title ?? ''} onClose={close} size="lg">
      {preview ? preview.type.startsWith('image/') ? <img className="doc-image" src={preview.url} alt={preview.title} /> : <iframe className="doc-frame" title={preview.title} src={preview.url} /> : null}
    </Modal>
  );
  return { open, busy, error, viewer };
}

export function MedicalDocumentViewer({ documents }: { documents: MedicalDocument[] }) {
  const { open, busy, error, viewer } = useDocumentOpener();
  if (!documents.length) return <EmptyState icon="file" title="No documents yet" message="Uploaded reports, prescriptions and letters will appear here." />;
  return (
    <>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="list">
        {documents.map((d) => (
          <li key={d.id} className="list-item" data-testid="document-row">
            <div className="list-item-main">
              <p className="list-item-title">{d.title}</p>
              <p className="list-item-meta">
                {documentTypeLabel[d.type] ?? d.type} · {formatDate(d.createdAt)} · {formatBytes(d.sizeBytes)}
              </p>
            </div>
            <div className="button-row">
              <Button size="sm" variant="secondary" icon="eye" loading={busy === d.id} onClick={() => void open(d.id, d.title)} aria-label={`View ${d.title}`}>
                View
              </Button>
              <Button size="sm" variant="ghost" icon="download" onClick={() => void open(d.id, d.filename, 'download')} aria-label={`Download ${d.title}`}>
                Download
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {viewer}
    </>
  );
}
