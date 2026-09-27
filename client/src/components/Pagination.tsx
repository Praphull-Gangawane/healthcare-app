import type { PageMeta } from '../types/api';
import { Button } from './Button';

export function Pagination({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="muted small" style={{ margin: 0 }}>
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </p>
      <div className="button-row">
        <Button variant="secondary" size="sm" icon="arrowLeft" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
