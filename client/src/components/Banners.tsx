import { useConfig } from '../hooks/useConfig';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Icon } from './Icon';

export function DemoBanner() {
  const { config } = useConfig();
  if (!config.demoMode) return null;
  return (
    <div className="banner demo-banner" data-testid="demo-banner" role="note">
      <Icon name="alert" />
      <span>DEMO DATA — NOT MEDICAL ADVICE</span>
    </div>
  );
}

export function OfflineBanner() {
  const { online, browserOnline } = useOnlineStatus();
  return (
    <div aria-live="assertive">
      {online ? null : (
        <div className="banner offline-banner" role="alert" data-testid="offline-banner">
          <Icon name="wifiOff" />
          <span>
            {browserOnline
              ? "We can't reach the server right now. Your changes are kept on this device — try again shortly."
              : "You're offline. Your changes are kept on this device and you can retry when you're back online."}
          </span>
        </div>
      )}
    </div>
  );
}
