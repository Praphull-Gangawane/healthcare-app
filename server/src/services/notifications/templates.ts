import { config } from '../../config/env.js';

/**
 * Transactional message templates. Content is deliberately minimal: no diagnoses, medicines,
 * results or other clinical details — sensitive information stays behind the authenticated portal.
 * `whatsappTemplate` / `dltTemplateId` must match templates approved with Meta / registered on DLT.
 */
export interface TemplateDef {
  purpose: string;
  subject: string;
  /** Variable names, in the order used for provider template parameters. */
  vars: string[];
  text: (v: Record<string, string>) => string;
  whatsappTemplate: string;
  dltTemplateId?: string;
}

const app = () => config.APP_NAME;

export const TEMPLATES = {
  APPOINTMENT_CONFIRMED: {
    purpose: 'APPOINTMENT',
    subject: 'Appointment confirmed',
    vars: ['doctor', 'date', 'time', 'appointmentNumber'],
    text: (v) => `${app()}: Your appointment with ${v.doctor} is confirmed for ${v.date} at ${v.time}. Appointment ID: ${v.appointmentNumber}.`,
    whatsappTemplate: 'appointment_confirmation',
  },
  APPOINTMENT_REMINDER: {
    purpose: 'REMINDER',
    subject: 'Appointment reminder',
    vars: ['doctor', 'date', 'time', 'appointmentNumber'],
    text: (v) => `Reminder: You have an appointment with ${v.doctor} on ${v.date} at ${v.time}. ID: ${v.appointmentNumber} - ${app()}`,
    whatsappTemplate: 'appointment_reminder',
  },
  APPOINTMENT_RESCHEDULED: {
    purpose: 'APPOINTMENT',
    subject: 'Appointment rescheduled',
    vars: ['appointmentNumber', 'date', 'time'],
    text: (v) => `Your appointment has been rescheduled to ${v.date} at ${v.time}. Appointment ID: ${v.appointmentNumber}. - ${app()}`,
    whatsappTemplate: 'appointment_rescheduled',
  },
  APPOINTMENT_CANCELLED: {
    purpose: 'APPOINTMENT',
    subject: 'Appointment cancelled',
    vars: ['appointmentNumber'],
    text: (v) => `Your appointment ${v.appointmentNumber} has been cancelled. - ${app()}`,
    whatsappTemplate: 'appointment_cancelled',
  },
  QUEUE_CALLED: {
    purpose: 'QUEUE',
    subject: 'Your turn is coming up',
    vars: ['token', 'room'],
    text: (v) => `Token ${v.token}: it is almost your turn. Please proceed to ${v.room}. - ${app()}`,
    whatsappTemplate: 'queue_update',
  },
  PRESCRIPTION_READY: {
    purpose: 'PRESCRIPTION',
    subject: 'Your prescription is available',
    vars: ['link'],
    text: (v) => `Your prescription is available. Open your secure patient portal to view it: ${v.link} - ${app()}`,
    whatsappTemplate: 'prescription_ready',
  },
  LAB_REPORT_READY: {
    purpose: 'LAB_REPORT',
    subject: 'Your test report is ready',
    vars: ['link'],
    text: (v) => `Your test report is ready. Sign in to your patient portal to view it: ${v.link} - ${app()}`,
    whatsappTemplate: 'report_ready',
  },
  FOLLOW_UP_REMINDER: {
    purpose: 'FOLLOW_UP',
    subject: 'Follow-up reminder',
    vars: ['date'],
    text: (v) => `Reminder: your doctor advised a follow-up visit around ${v.date}. You can book it in your patient portal. - ${app()}`,
    whatsappTemplate: 'follow_up_reminder',
  },
} satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

export function render(key: TemplateKey, vars: Record<string, string>) {
  const def: TemplateDef = TEMPLATES[key];
  const missing = def.vars.filter((v) => !(v in vars));
  if (missing.length) throw new Error(`Template ${key} missing variables: ${missing.join(',')}`);
  return { text: def.text(vars), subject: `${app()}: ${def.subject}`, params: def.vars.map((v) => vars[v] ?? ''), def };
}
