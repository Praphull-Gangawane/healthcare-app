import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { errorMessage, SESSION_EXPIRED_MESSAGE } from '../../utils/errors';
import { homeFor, safeNext } from '../../utils/roles';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });
type Values = z.infer<typeof schema>;

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const next = safeNext(params.get('next'));
  return (
    <div className="page page-narrow">
      <div className="card stack" style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1>Sign in</h1>
        {params.get('expired') ? <Alert tone="warning">{SESSION_EXPIRED_MESSAGE}</Alert> : null}
        {error ? (
          <Alert tone="error" testId="login-error">
            {error}
          </Alert>
        ) : null}
        <form
          className="stack-sm"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              const user = await login(v.email, v.password);
              navigate(next ?? homeFor(user), { replace: true });
            } catch (err) {
              setError(errorMessage(err));
            }
          })}
        >
          <TextField label="Email" type="email" autoComplete="username" error={formState.errors.email?.message} {...register('email')} />
          <TextField label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
          <Button type="submit" variant="primary" block loading={formState.isSubmitting} loadingText="Signing in…">
            Sign in
          </Button>
        </form>
        <p className="small">
          New here? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
