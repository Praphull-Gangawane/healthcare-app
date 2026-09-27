import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications';
import { NotificationSettings } from '../../components/NotificationSettings';
import { PageHeader } from '../../components/PageHeader';
import { PatientPicker } from '../../components/PatientPicker';
import { usePortalPatients } from '../../hooks/usePortalPatients';
import { formatDateTime } from '../../utils/format';
import { channelLabel, notificationStatusLabel, templateLabel } from '../../utils/labels';

export function MyNotifications() {
  const { options, patientId, setPatientId } = usePortalPatients();
  const recent = useQuery({ queryKey: ['notifications', 'mine'], queryFn: notificationsApi.mine });
  return (
    <div className="page stack">
      <PageHeader title="Notification settings" subtitle="Choose how we send appointment and report updates. You can change this at any time." docTitle="Notification settings" />
      <PatientPicker options={options} value={patientId} onChange={setPatientId} />
      {patientId ? <NotificationSettings patientId={patientId} /> : null}
      <section className="card stack-sm" aria-labelledby="recent-h">
        <h2 id="recent-h">Recent messages</h2>
        {recent.data?.length ? (
          <ul className="list">
            {recent.data.slice(0, 20).map((n) => (
              <li key={n.id} className="list-item small">
                {formatDateTime(n.createdAt)} · {channelLabel[n.channel] ?? n.channel} · {templateLabel[n.templateKey] ?? n.templateKey} · {notificationStatusLabel[n.status] ?? n.status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No messages yet.</p>
        )}
      </section>
    </div>
  );
}
