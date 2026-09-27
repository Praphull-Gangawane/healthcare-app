import type { NotificationMessage, NotificationProvider, NotificationResult } from '../../providers/notification/types.js';

export interface WhatsAppCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  languageCode: string;
}

/**
 * Official WhatsApp Business Platform (Cloud API) adapter. Business-initiated messages must use a
 * pre-approved template (Utility category for transactional updates) and the recipient must have
 * opted in to WhatsApp messages from this business. No unofficial automation is used or supported.
 * Status: production integration pending — requires a verified WABA, approved templates and
 * webhook handling for delivery/read statuses (see /api/notifications/webhooks/whatsapp).
 */
export class WhatsAppCloudApiProvider implements NotificationProvider {
  readonly name = 'whatsapp-cloud-api';
  readonly channel = 'WHATSAPP' as const;
  constructor(private readonly cfg: WhatsAppCloudConfig) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const url = `https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: message.providerTemplateId ?? message.templateKey.toLowerCase(),
            language: { code: this.cfg.languageCode },
            components: [
              { type: 'body', parameters: message.params.map((text) => ({ type: 'text', text })) },
            ],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number } };
      if (!res.ok) {
        return { status: 'FAILED', failureReason: `WA_${body.error?.code ?? res.status}`, retryable: res.status >= 500 || res.status === 429 };
      }
      return { status: 'SENT', providerMessageId: body.messages?.[0]?.id, retryable: false };
    } catch {
      return { status: 'FAILED', failureReason: 'NETWORK_ERROR', retryable: true };
    }
  }
}
