import { sha256 } from '../../lib/crypto.js';
import type { SignRequest, SignResult, SigningProvider } from './types.js';

export class SessionAttestationSigner implements SigningProvider {
  readonly name = 'session-attestation';

  sign(req: SignRequest): Promise<SignResult> {
    const ref = sha256(`${req.prescriptionId}:${req.versionNumber}:${req.contentHash}:${req.signerUserId}:${req.sessionId}`);
    return Promise.resolve({
      method: 'SESSION_ATTESTATION',
      signatureRef: `attest:${ref.slice(0, 32)}`,
      statement:
        'Electronically authorised by the prescribing doctor via authenticated session. This is not a digital signature certificate.',
    });
  }
}

/** Extension point for a certificate-based signing service. Production integration pending. */
export class DigitalSignatureProviderStub implements SigningProvider {
  readonly name = 'digital-signature-pending';
  sign(): Promise<SignResult> {
    return Promise.reject(new Error('Digital signature provider not configured'));
  }
}
