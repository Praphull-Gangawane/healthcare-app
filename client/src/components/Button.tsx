import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

interface CommonProps {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  block?: boolean;
}

function classes({ variant = 'primary', size = 'md', block }: CommonProps, extra?: string) {
  return ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : '', extra ?? ''].filter(Boolean).join(' ');
}

export interface ButtonProps extends CommonProps, Omit<ComponentProps<'button'>, 'children'> {
  loading?: boolean;
  loadingText?: string;
  children?: ReactNode;
}

export function Button({ variant, size, icon, block, loading, loadingText, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={classes({ variant, size, block }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}

export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: CommonProps & LinkProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </Link>
  );
}
