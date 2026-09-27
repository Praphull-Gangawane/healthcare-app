import type { NotificationMessage, NotificationProvider, NotificationResult } from '../../providers/notification/types.js';

export interface HttpEmailConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
}

/** Generic transactional-email HTTP API adapter. Status: production integration pending. */
export class HttpEmailProvider implements NotificationProvider {
  readonly name = 'http-email';
  readonly channel = 'EMAIL' as const;
  constructor(private readonly cfg: HttpEmailConfig) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    try {
      const res = await fetch(this.cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ from: this.cfg.from, to: message.to, subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { status: 'FAILED', failureReason: `HTTP_${res.status}`, retryable: res.status >= 500 };
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { status: 'SENT', providerMessageId: body.id, retryable: false };
    } catch {
      return { status: 'FAILED', failureReason: 'NETWORK_ERROR', retryable: true };
    }
  }
}
