import { useId, useState } from 'react';
import { Button } from './Button';
import { formatBytes } from '../utils/format';

const ACCEPT = 'application/pdf,image/png,image/jpeg';
const MAX = 10 * 1024 * 1024;

/** File picker with client-side pre-checks; the server re-validates type, size and magic bytes. */
export function FileUpload({ label = 'Choose a file', onUpload, busy, withTitle = true }: { label?: string; onUpload: (file: File, title: string) => Promise<void> | void; busy?: boolean; withTitle?: boolean }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  function pick(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!ACCEPT.split(',').includes(f.type)) return setError('Only PDF, PNG and JPEG files are accepted.');
    if (f.size > MAX) return setError('Files must be smaller than 10 MB.');
    setFile(f);
  }
  return (
    <form
      className="stack-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return setError('Please choose a file to upload.');
        await onUpload(file, title);
        setFile(null);
        setTitle('');
        (e.target as HTMLFormElement).reset();
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-file`}>{label}</label>
        <p className="hint" id={`${id}-hint`}>
          PDF, PNG or JPEG, up to 10 MB.
        </p>
        <input id={`${id}-file`} type="file" accept={ACCEPT} aria-describedby={`${id}-hint`} aria-invalid={error ? true : undefined} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        {file ? <p className="small muted">{`${file.name} · ${formatBytes(file.size)}`}</p> : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {withTitle ? (
        <div className="field">
          <label htmlFor={`${id}-title`}>Title (optional)</label>
          <input id={`${id}-title`} className="input" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
        </div>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" icon="upload" loading={busy} loadingText="Uploading…">
          Upload
        </Button>
      </div>
    </form>
  );
}
