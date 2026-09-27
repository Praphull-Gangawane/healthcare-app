/**
 * MFA extension point. Production deployments should plug in TOTP/WebAuthn or an OTP provider
 * here. Never log OTP values. Not enabled in the MVP (User.mfaEnabled defaults to false).
 */
export interface MfaProvider {
  readonly name: string;
  beginChallenge(userId: string): Promise<{ challengeId: string }>;
  verifyChallenge(challengeId: string, code: string): Promise<boolean>;
}

export class NotConfiguredMfaProvider implements MfaProvider {
  readonly name = 'not-configured';
  beginChallenge(): Promise<{ challengeId: string }> {
    return Promise.reject(new Error('MFA provider not configured'));
  }
  verifyChallenge(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
