import { config } from '../config/env.js';
import { HttpSmsProvider } from '../integrations/sms/httpSmsProvider.js';
import { WhatsAppCloudApiProvider } from '../integrations/whatsapp/cloudApiProvider.js';
import { HttpEmailProvider } from '../integrations/email/httpEmailProvider.js';
import { S3CompatibleStorageProvider } from '../integrations/storage/s3CompatibleProvider.js';
import { MockNotificationProvider } from './notification/mock.js';
import type { Channel, NotificationProvider } from './notification/types.js';
import { LocalStorageProvider } from './storage/local.js';
import { MockStorageProvider } from './storage/mock.js';
import type { StorageProvider } from './storage/types.js';
import { MockPaymentProvider } from './payment/mock.js';
import type { PaymentProvider } from './payment/types.js';
import { ClientIngestHealthProvider, MockHealthDataProvider } from './healthdata/mock.js';
import type { HealthDataProvider, HealthProviderType } from './healthdata/types.js';
import { MockTeleconsultationProvider } from './teleconsult/mock.js';
import type { TeleconsultationProvider } from './teleconsult/types.js';
import { SessionAttestationSigner } from './signing/sessionAttestation.js';
import type { SigningProvider } from './signing/types.js';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for the configured provider`);
  return value;
}

function buildNotificationProviders(): Record<Channel, NotificationProvider> {
  const sms =
    config.SMS_PROVIDER === 'http'
      ? new HttpSmsProvider({
          apiUrl: required('SMS_API_URL', config.SMS_API_URL),
          apiKey: required('SMS_API_KEY', config.SMS_API_KEY),
          senderId: required('SMS_SENDER_ID', config.SMS_SENDER_ID),
          dltEntityId: config.SMS_DLT_ENTITY_ID,
        })
      : new MockNotificationProvider('SMS');
  const whatsapp =
    config.WHATSAPP_PROVIDER === 'cloud_api'
      ? new WhatsAppCloudApiProvider({
          accessToken: required('WHATSAPP_ACCESS_TOKEN', config.WHATSAPP_ACCESS_TOKEN),
          phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID', config.WHATSAPP_PHONE_NUMBER_ID),
          apiVersion: config.WHATSAPP_API_VERSION,
          languageCode: config.WHATSAPP_TEMPLATE_LANGUAGE,
        })
      : new MockNotificationProvider('WHATSAPP');
  const email =
    config.EMAIL_PROVIDER === 'http'
      ? new HttpEmailProvider({
          apiUrl: required('EMAIL_API_URL', config.EMAIL_API_URL),
          apiKey: required('EMAIL_API_KEY', config.EMAIL_API_KEY),
          from: config.EMAIL_FROM,
        })
      : new MockNotificationProvider('EMAIL');
  return { SMS: sms, WHATSAPP: whatsapp, EMAIL: email };
}

function buildStorage(): StorageProvider {
  switch (config.STORAGE_PROVIDER) {
    case 'mock':
      return new MockStorageProvider();
    case 's3':
      return new S3CompatibleStorageProvider(config.STORAGE_BUCKET);
    default:
      return new LocalStorageProvider(config.STORAGE_LOCAL_DIR);
  }
}

const healthProviders: Record<HealthProviderType, HealthDataProvider> = {
  MOCK: new MockHealthDataProvider(),
  APPLE_HEALTHKIT: new ClientIngestHealthProvider('APPLE_HEALTHKIT', false),
  ANDROID_HEALTH_CONNECT: new ClientIngestHealthProvider('ANDROID_HEALTH_CONNECT', false),
  WEARABLE: new ClientIngestHealthProvider('WEARABLE', false),
  BLUETOOTH_DEVICE: new ClientIngestHealthProvider('BLUETOOTH_DEVICE', false),
  CAMERA_PPG_DEMO: new ClientIngestHealthProvider('CAMERA_PPG_DEMO', false),
};

export const providers: {
  notification: Record<Channel, NotificationProvider>;
  storage: StorageProvider;
  payment: PaymentProvider;
  health: Record<HealthProviderType, HealthDataProvider>;
  teleconsult: TeleconsultationProvider;
  signing: SigningProvider;
} = {
  notification: buildNotificationProviders(),
  storage: buildStorage(),
  payment: new MockPaymentProvider(),
  health: healthProviders,
  teleconsult: new MockTeleconsultationProvider(),
  signing: new SessionAttestationSigner(),
};

export function providerStatus() {
  return {
    sms: providers.notification.SMS.name,
    whatsapp: providers.notification.WHATSAPP.name,
    email: providers.notification.EMAIL.name,
    storage: providers.storage.name,
    payment: providers.payment.name,
    teleconsult: providers.teleconsult.name,
    signing: providers.signing.name,
    healthData: config.HEALTH_DATA_PROVIDER,
    fhir: config.FHIR_PROVIDER,
    abdm: config.ABDM_PROVIDER,
  };
}
