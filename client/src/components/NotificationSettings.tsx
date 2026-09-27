import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../api/patients';
import type { ConsentState } from '../types/domain';
import { errorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import { useToast } from '../hooks/useToast';
import { QueryState } from './QueryState';

const CHANNELS: { channel: ConsentState['channel']; title: string; description: string }[] = [
  { channel: 'SMS', title: 'SMS', description: 'Appointment confirmations, reminders and "your prescription/report is ready" alerts.' },
  { channel: 'WHATSAPP', title: 'WhatsApp', description: 'The same updates on WhatsApp, using approved message templates. Messages contain a secure link, never medical details.' },
  { channel: 'EMAIL', title: 'Email', description: 'Updates and account notices by email.' },
];

/** Explicit per-channel opt-in/opt-out. Every change is recorded in an append-only history. */
export function NotificationSettings({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['consents', patientId], queryFn: () => patientsApi.consents(patientId) });
  const mutation = useMutation({
    mutationFn: ({ channel, optedIn }: { channel: ConsentState['channel']; optedIn: boolean }) => patientsApi.setConsent(patientId, channel, optedIn),
    onSuccess: (_d, v) => {
      toast.success(`${v.channel === 'WHATSAPP' ? 'WhatsApp' : v.channel === 'SMS' ? 'SMS' : 'Email'} updates ${v.optedIn ? 'turned on' : 'turned off'}.`);
      void qc.invalidateQueries({ queryKey: ['consents', patientId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <QueryState query={query}>
      {(data) => (
        <div className="stack" data-testid="notification-settings">
          <fieldset className="stack-sm">
            <legend className="section-title">Message channels</legend>
            {CHANNELS.map((c) => {
              const state = data.current.find((s) => s.channel === c.channel);
              const on = state?.optedIn ?? false;
              return (
                <div key={c.channel} className="card card-tight checkbox-field">
                  <input id={`consent-${c.channel}`} type="checkbox" data-testid={`consent-toggle-${c.channel.toLowerCase()}`} checked={on} disabled={mutation.isPending} onChange={(e) => mutation.mutate({ channel: c.channel, optedIn: e.target.checked })} aria-describedby={`consent-${c.channel}-desc`} />
                  <div>
                    <label htmlFor={`consent-${c.channel}`}>
                      <strong>{c.title}</strong> — {on ? 'On' : 'Off'}
                    </label>
                    <p className="hint" id={`consent-${c.channel}-desc`}>
                      {c.description}
                      {state?.updatedAt ? ` Last changed ${formatDateTime(state.updatedAt)}.` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </fieldset>
          <details>
            <summary>Consent history</summary>
            <ul className="list">
              {data.history.map((h) => (
                <li key={h.id} className="list-item small">
                  {formatDateTime(h.createdAt)} · {h.channel} · {h.optedIn ? 'Opted in' : 'Opted out'} · via {h.source.toLowerCase().replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </QueryState>
  );
}
