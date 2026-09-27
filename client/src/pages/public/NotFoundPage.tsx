import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page page-narrow">
      <h1 className="visually-hidden">Page not found</h1>
      <EmptyState icon="search" title="We couldn’t find that page" message="The link may be out of date." action={<ButtonLink to="/" variant="primary">Go to home</ButtonLink>} headingLevel={2} />
    </div>
  );
}
