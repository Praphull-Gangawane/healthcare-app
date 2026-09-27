import {
  HealthProviderError,
  type HealthDataProvider,
  type HeartRateReading,
  type PermissionResult,
  type ProviderContext,
} from './types.js';

/**
 * Deterministic "Mock Wearable". Scenarios (for tests/demo): `permission_denied`,
 * `device_unavailable`, `provider_failure`, `invalid_reading`, `future_timestamp`, `elevated`.
 * Default returns resting readings around 72 bpm.
 */
export class MockHealthDataProvider implements HealthDataProvider {
  readonly type = 'MOCK' as const;
  readonly pullSupported = true;
  readonly clinicalGrade = false;

  requestPermission(ctx: ProviderContext): Promise<PermissionResult> {
    if (ctx.scenario === 'permission_denied') {
      return Promise.resolve({ status: 'DENIED', scopes: [], reason: 'User declined access' });
    }
    return Promise.resolve({ status: 'GRANTED', scopes: ['heart_rate.read'] });
  }

  getHeartRate(ctx: ProviderContext, since: Date): Promise<HeartRateReading[]> {
    switch (ctx.scenario) {
      case 'device_unavailable':
        return Promise.reject(new HealthProviderError('DEVICE_UNAVAILABLE', 'Mock wearable is not connected'));
      case 'provider_failure':
        return Promise.reject(new HealthProviderError('PROVIDER_FAILURE', 'Mock provider error'));
      default:
        break;
    }
    const base = Math.max(since.getTime(), Date.now() - 60 * 60_000);
    const bpmSeries =
      ctx.scenario === 'invalid_reading' ? [72, 0, 400] : ctx.scenario === 'elevated' ? [104, 108, 112] : [71, 72, 73];
    const readings = bpmSeries.map((bpm, i) => ({
      externalId: `mock-${ctx.patientId}-${Math.floor(base / 60_000) + i}-${ctx.scenario ?? 'default'}`,
      bpm,
      measuredAt:
        ctx.scenario === 'future_timestamp' && i === 2
          ? new Date(Date.now() + 2 * 3_600_000)
          : new Date(Math.min(Date.now(), base + (i + 1) * 10 * 60_000)),
      context: 'RESTING',
      deviceName: 'Mock Wearable',
      accuracy: { confidence: 'demo', sampleWindowSeconds: 30 },
    }));
    return Promise.resolve(readings);
  }
}

/**
 * Adapter for on-device platforms (Apple HealthKit, Android Health Connect, BLE devices, wearables).
 * The client app owns OS permission prompts and pushes readings; the server records permission
 * state reported by the client and validates pushed readings. Production integration pending.
 */
export class ClientIngestHealthProvider implements HealthDataProvider {
  readonly pullSupported = false;
  constructor(
    readonly type: 'APPLE_HEALTHKIT' | 'ANDROID_HEALTH_CONNECT' | 'WEARABLE' | 'BLUETOOTH_DEVICE' | 'CAMERA_PPG_DEMO',
    readonly clinicalGrade: boolean,
  ) {}

  requestPermission(): Promise<PermissionResult> {
    // Permission is granted on-device; the client reports the result to the API.
    return Promise.resolve({ status: 'GRANTED', scopes: ['heart_rate.read'] });
  }

  getHeartRate(): Promise<HeartRateReading[]> {
    return Promise.reject(
      new HealthProviderError('DEVICE_UNAVAILABLE', `${this.type} readings are pushed by the client app`),
    );
  }
}
