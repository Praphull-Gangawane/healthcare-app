import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { notificationsApi } from '../../api/notifications';
import { Alert } from '../../components/Alert';
import { ButtonLink } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../hooks/useAuth';
import { errorCode, errorMessage } from '../../utils/errors';

/** Deep link from SMS/WhatsApp. The token alone reveals nothing; the patient must be signed in. */
export function SecureLinkPage() {
  const { token = '' } = useParams();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    notificationsApi
      .resolveSecureLink(token)
      .then((t) => navigate(t.resourceType === 'Prescription' ? `/portal/prescriptions/${t.resourceId}` : '/portal/reports', { replace: true }))
      .catch((err: unknown) => setError({ code: errorCode(err), message: errorMessage(err) }));
  }, [user, token, navigate]);
  if (isLoading) return <LoadingSkeleton label="Opening your secure link…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/s/${token}`)}`} replace />;
  return (
    <div className="page page-narrow">
      <h1>Secure link</h1>
      {error ? (
        <Alert tone={error.code === 'LINK_EXPIRED' ? 'warning' : 'error'} title={error.code === 'LINK_EXPIRED' ? 'This link has expired' : 'We couldn’t open this link'}>
          {error.message}
        </Alert>
      ) : (
        <LoadingSkeleton label="Opening your record…" />
      )}
      <ButtonLink to="/portal" variant="secondary">
        Go to my dashboard
      </ButtonLink>
    </div>
  );
}
