export interface SignRequest {
  prescriptionId: string;
  versionNumber: number;
  contentHash: string;
  signerUserId: string;
  sessionId: string;
}

export interface SignResult {
  method: 'SESSION_ATTESTATION' | 'DIGITAL_SIGNATURE';
  signatureRef: string;
  /** Human-readable statement printed on the PDF. */
  statement: string;
}

/**
 * Prescription authorization. The development implementation is an authenticated-session
 * attestation (doctor signed in + explicit "Finalize"). It is NOT a legally recognised digital
 * signature. Production: plug in an approved signing provider / organisation certificate workflow.
 */
export interface SigningProvider {
  readonly name: string;
  sign(req: SignRequest): Promise<SignResult>;
}
