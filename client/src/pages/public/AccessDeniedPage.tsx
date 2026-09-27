import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import { homeFor } from '../../utils/roles';

export function AccessDenied() {
  const { user } = useAuth();
  return (
    <div className="page" data-testid="access-denied">
      <h1>Access restricted</h1>
      <EmptyState icon="lock" title="You don’t have access to this page" message="This area is for a different role. If you think this is a mistake, contact your administrator." action={<ButtonLink to={homeFor(user)} variant="primary">Go to my dashboard</ButtonLink>} />
    </div>
  );
}
