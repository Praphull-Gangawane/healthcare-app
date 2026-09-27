import type { NotificationMessage, NotificationProvider, NotificationResult } from '../../providers/notification/types.js';

export interface HttpSmsConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  dltEntityId?: string;
}

/**
 * Generic transactional-SMS gateway adapter (India). Production use requires DLT registration:
 * a registered header (sender id), a registered content template (providerTemplateId) whose fixed
 * text matches `text`, and whitelisted URLs. Map the request body to your gateway's API.
 * Status: production integration pending — verify against the chosen gateway's documentation.
 */
export class HttpSmsProvider implements NotificationProvider {
  readonly name = 'http-sms';
  readonly channel = 'SMS' as const;
  constructor(private readonly cfg: HttpSmsConfig) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    try {
      const res = await fetch(this.cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({
          to: message.to,
          sender: this.cfg.senderId,
          message: message.text,
          dltEntityId: this.cfg.dltEntityId,
          dltTemplateId: message.providerTemplateId,
          reference: message.idempotencyKey,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { status: 'FAILED', failureReason: `HTTP_${res.status}`, retryable: res.status >= 500 || res.status === 429 };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { status: 'SENT', providerMessageId: body.messageId ?? body.id, retryable: false };
    } catch {
      return { status: 'FAILED', failureReason: 'NETWORK_ERROR', retryable: true };
    }
  }
}
