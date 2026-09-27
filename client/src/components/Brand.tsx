import { Link } from 'react-router-dom';
import { useConfig } from '../hooks/useConfig';
import { Icon } from './Icon';

export function Brand({ to = '/' }: { to?: string }) {
  const { appName } = useConfig();
  return (
    <Link to={to} className="brand" aria-label={`${appName} home`}>
      <span className="brand-mark" aria-hidden="true">
        <Icon name="cross" />
      </span>
      <span className="brand-name">{appName}</span>
    </Link>
  );
}
