export type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL';

export interface NotificationMessage {
  channel: Channel;
  to: string;
  templateKey: string;
  purpose: string;
  /** Rendered minimal-content text (SMS body / email body). */
  text: string;
  subject?: string;
  /** Ordered template parameters (WhatsApp approved templates / DLT variables). */
  params: string[];
  /** Provider-side template identifiers (DLT template id, WhatsApp template name). */
  providerTemplateId?: string;
  idempotencyKey: string;
}

export interface NotificationResult {
  status: 'SENT' | 'FAILED';
  providerMessageId?: string;
  failureReason?: string;
  retryable: boolean;
}

export interface NotificationProvider {
  readonly name: string;
  readonly channel: Channel;
  send(message: NotificationMessage): Promise<NotificationResult>;
}
