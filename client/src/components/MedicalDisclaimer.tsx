import { Link } from 'react-router-dom';
import { useConfig } from '../hooks/useConfig';
import { Icon } from './Icon';

export const DISCLAIMER_TEXT =
  'This application supports healthcare workflows. It does not replace professional medical evaluation. For severe or emergency symptoms, contact local emergency medical services (112) or seek immediate in-person care.';

export function MedicalDisclaimer() {
  const { appName } = useConfig();
  return (
    <footer className="site-footer" data-testid="medical-disclaimer">
      <div className="site-footer-inner">
        <p className="disclaimer">
          <Icon name="info" />
          <span>{DISCLAIMER_TEXT}</span>
        </p>
        <div className="footer-links">
          <span>
            © {new Date().getFullYear()} {appName}
          </span>
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/doctors">Find a doctor</Link>
        </div>
      </div>
    </footer>
  );
}
