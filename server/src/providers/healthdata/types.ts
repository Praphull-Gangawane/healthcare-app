export type HealthProviderType =
  | 'MOCK'
  | 'APPLE_HEALTHKIT'
  | 'ANDROID_HEALTH_CONNECT'
  | 'WEARABLE'
  | 'BLUETOOTH_DEVICE'
  | 'CAMERA_PPG_DEMO';

export interface PermissionResult {
  status: 'GRANTED' | 'DENIED';
  scopes: string[];
  reason?: string;
}

export interface HeartRateReading {
  externalId: string;
  bpm: number;
  measuredAt: Date;
  context?: string;
  deviceName?: string;
  accuracy?: Record<string, unknown>;
}

export interface ProviderContext {
  patientId: string;
  /** Test/demo scenario selector for the mock provider only. */
  scenario?: string | undefined;
}

/**
 * Health-data source abstraction. Server-side, most real platforms (HealthKit, Health Connect,
 * BLE devices) are on-device APIs: the mobile/client app requests OS-level permission, reads data,
 * and pushes readings to POST /api/health-data/readings. Those adapters therefore validate and
 * ingest rather than pull. Pull-capable providers (e.g. a vendor cloud API) implement getHeartRate.
 */
export interface HealthDataProvider {
  readonly type: HealthProviderType;
  readonly pullSupported: boolean;
  /** Whether readings from this source can ever be treated as clinical measurements. */
  readonly clinicalGrade: boolean;
  requestPermission(ctx: ProviderContext): Promise<PermissionResult>;
  getHeartRate(ctx: ProviderContext, since: Date): Promise<HeartRateReading[]>;
}

export class HealthProviderError extends Error {
  constructor(readonly kind: 'DEVICE_UNAVAILABLE' | 'PROVIDER_FAILURE' | 'PERMISSION_DENIED', message: string) {
    super(message);
  }
}
