import { useId, type ComponentProps, type ReactNode } from 'react';
import { Icon } from './Icon';

interface FieldBase {
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
}

function useFieldIds(id?: string) {
  const auto = useId();
  const fieldId = id ?? `f${auto.replace(/:/g, '')}`;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

function describedBy(hint: unknown, error: unknown, hintId: string, errorId: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
}

export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="field-error" id={id}>
      <Icon name="alertCircle" />
      <span>{message}</span>
    </p>
  );
}

function Label({ htmlFor, label, optional }: { htmlFor: string; label: ReactNode; optional?: boolean | undefined }) {
  return (
    <label htmlFor={htmlFor}>
      {label}
      {optional ? <span className="optional"> (optional)</span> : null}
    </label>
  );
}

export function TextField({ label, error, hint, optional, className, id, ...input }: FieldBase & ComponentProps<'input'>) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={`field ${className ?? ''}`}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      {hint ? <p className="hint" id={hintId}>{hint}</p> : null}
      <input id={fieldId} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...input} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextareaField({ label, error, hint, optional, className, id, ...input }: FieldBase & ComponentProps<'textarea'>) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={`field ${className ?? ''}`}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      {hint ? <p className="hint" id={hintId}>{hint}</p> : null}
      <textarea id={fieldId} className="textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...input} />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({ label, error, hint, optional, className, id, options, placeholder, ...input }: FieldBase & ComponentProps<'select'> & { options: Option[]; placeholder?: string }) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={`field ${className ?? ''}`}>
      <Label htmlFor={fieldId} label={label} optional={optional} />
      {hint ? <p className="hint" id={hintId}>{hint}</p> : null}
      <select id={fieldId} className="select" aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...input}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function CheckboxField({ label, error, hint, className, id, ...input }: Omit<FieldBase, 'optional'> & ComponentProps<'input'>) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  return (
    <div className={className}>
      <div className="checkbox-field">
        <input type="checkbox" id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, hintId, errorId)} {...input} />
        <label htmlFor={fieldId}>
          {label}
          {hint ? (
            <span className="hint" id={hintId}>
              {hint}
            </span>
          ) : null}
        </label>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
