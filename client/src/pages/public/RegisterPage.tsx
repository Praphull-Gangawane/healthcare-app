import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CheckboxField, SelectField, TextField, TextareaField } from '../../components/Field';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { errorCode, errorMessage, fieldIssues } from '../../utils/errors';
import { safeNext } from '../../utils/roles';

const list = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(80),
    lastName: z.string().trim().max(80).optional(),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
    gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'], { errorMap: () => ({ message: 'Select an option' }) }),
    mobile: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(10, 'At least 10 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/\d/, 'Include a number'),
    line1: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().regex(/^(\d{6})?$/, 'Enter a 6-digit PIN code').optional(),
    ecName: z.string().trim().max(80).optional(),
    ecRelationship: z.string().trim().max(40).optional(),
    ecPhone: z.string().trim().regex(/^((\+91)?[6-9]\d{9})?$/, 'Enter a 10-digit mobile number').optional(),
    bloodGroup: z.string().optional(),
    allergies: z.string().max(500).optional(),
    conditions: z.string().max(500).optional(),
    medications: z.string().max(500).optional(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
    emailConsent: z.boolean(),
    acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms and privacy notice'),
  })
  .refine((v) => !v.line1 || (v.city && v.state), { path: ['city'], message: 'Enter city and state with the address' });

type Values = z.infer<typeof registerSchema>;

export function RegisterPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setSessionUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError: setFieldError } = useForm<Values>({ resolver: zodResolver(registerSchema), defaultValues: { sms: true, whatsapp: false, emailConsent: true, acceptTerms: false } });
  const e = formState.errors;
  return (
    <div className="page page-narrow">
      <div className="card stack">
        <h1>Create your account</h1>
        <p className="muted">We only ask for what your care team needs. Fields marked optional can be added later.</p>
        {error ? (
          <Alert tone="error" testId="register-error">
            {error}
          </Alert>
        ) : null}
        <form
          className="stack"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              const res = await authApi.register({
                firstName: v.firstName,
                ...(v.lastName ? { lastName: v.lastName } : {}),
                dateOfBirth: v.dateOfBirth,
                gender: v.gender,
                mobile: v.mobile,
                email: v.email,
                password: v.password,
                ...(v.line1 && v.city && v.state ? { address: { line1: v.line1, city: v.city, state: v.state, ...(v.postalCode ? { postalCode: v.postalCode } : {}), country: 'IN' } } : {}),
                ...(v.ecName && v.ecPhone ? { emergencyContact: { name: v.ecName, relationship: v.ecRelationship || 'Family', phone: v.ecPhone } } : {}),
                medicalProfile: {
                  ...(v.bloodGroup ? { bloodGroup: v.bloodGroup } : {}),
                  allergies: list(v.allergies).map((substance) => ({ substance })),
                  conditions: list(v.conditions),
                  currentMedications: list(v.medications),
                },
                consents: { sms: v.sms, whatsapp: v.whatsapp, email: v.emailConsent },
                acceptTerms: true,
              });
              setSessionUser(res.user);
              navigate(safeNext(params.get('next')) ?? '/portal', { replace: true });
            } catch (err) {
              if (errorCode(err) === 'PATIENT_POSSIBLE_DUPLICATE') setError('We may already have a record for you. Please contact the reception desk so we can link your account safely.');
              else setError(errorMessage(err));
              for (const i of fieldIssues(err)) if (i.path in registerSchema._def.schema.shape) setFieldError(i.path as keyof Values, { message: i.message });
            }
          })}
        >
          <fieldset className="stack-sm">
            <legend className="section-title">About you</legend>
            <div className="form-grid">
              <TextField label="First name" autoComplete="given-name" error={e.firstName?.message} {...register('firstName')} />
              <TextField label="Last name" optional autoComplete="family-name" error={e.lastName?.message} {...register('lastName')} />
              <TextField label="Date of birth" type="date" error={e.dateOfBirth?.message} {...register('dateOfBirth')} />
              <SelectField
                label="Gender"
                placeholder="Select…"
                error={e.gender?.message}
                options={[
                  { value: 'FEMALE', label: 'Female' },
                  { value: 'MALE', label: 'Male' },
                  { value: 'OTHER', label: 'Other' },
                  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
                ]}
                {...register('gender')}
              />
            </div>
          </fieldset>
          <fieldset className="stack-sm">
            <legend className="section-title">Contact & sign-in</legend>
            <div className="form-grid">
              <TextField label="Mobile number" type="tel" autoComplete="tel" hint="10 digits, e.g. 98765 43210" error={e.mobile?.message} {...register('mobile')} />
              <TextField label="Email" type="email" autoComplete="email" error={e.email?.message} {...register('email')} />
              <TextField label="Password" type="password" autoComplete="new-password" hint="At least 10 characters with upper- and lowercase letters and a number" error={e.password?.message} {...register('password')} />
            </div>
          </fieldset>
          <details>
            <summary>Address and emergency contact (optional)</summary>
            <div className="form-grid">
              <TextField label="Address" optional {...register('line1')} />
              <TextField label="City" optional error={e.city?.message} {...register('city')} />
              <TextField label="State" optional {...register('state')} />
              <TextField label="PIN code" optional error={e.postalCode?.message} {...register('postalCode')} />
              <TextField label="Emergency contact name" optional {...register('ecName')} />
              <TextField label="Relationship" optional {...register('ecRelationship')} />
              <TextField label="Emergency contact mobile" optional error={e.ecPhone?.message} {...register('ecPhone')} />
            </div>
          </details>
          <details>
            <summary>Medical profile (optional)</summary>
            <div className="form-grid">
              <SelectField label="Blood group" optional placeholder="Not sure" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({ value: b, label: b }))} {...register('bloodGroup')} />
              <TextareaField label="Allergies" optional hint="Separate with commas" {...register('allergies')} />
              <TextareaField label="Existing conditions" optional hint="Separate with commas" {...register('conditions')} />
              <TextareaField label="Current medicines" optional hint="Separate with commas" {...register('medications')} />
            </div>
          </details>
          <fieldset className="stack-sm">
            <legend className="section-title">How may we contact you?</legend>
            <CheckboxField label="Send me appointment and report updates by SMS" {...register('sms')} />
            <CheckboxField label="Send me updates on WhatsApp" hint="Optional. Messages contain a secure link, never medical details." {...register('whatsapp')} />
            <CheckboxField label="Send me updates by email" {...register('emailConsent')} />
            <CheckboxField
              label={
                <>
                  I agree to the terms and the <Link to="/privacy">privacy notice</Link>
                </>
              }
              error={e.acceptTerms?.message}
              {...register('acceptTerms')}
            />
          </fieldset>
          <Button type="submit" variant="primary" loading={formState.isSubmitting} loadingText="Creating account…">
            Create account
          </Button>
        </form>
        <p className="small">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
