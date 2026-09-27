/**
 * ABDM (Ayushman Bharat Digital Mission) integration boundary. NOT IMPLEMENTED against real
 * endpoints: production requires sandbox registration, HIP/HIU onboarding, certification and valid
 * credentials. The mock returns explicit NOT_CONNECTED results so nothing is fabricated.
 */
export interface AbdmProvider {
  readonly name: string;
  verifyAbhaAddress(abhaAddress: string): Promise<{ status: 'NOT_CONNECTED' | 'VERIFIED' | 'NOT_FOUND' }>;
  linkCareContext(input: { patientId: string; encounterId: string }): Promise<{ status: 'NOT_CONNECTED' | 'LINKED' }>;
  handleConsentRequest(input: { consentArtefactId: string }): Promise<{ status: 'NOT_CONNECTED' | 'ACCEPTED' }>;
}

export class MockAbdmProvider implements AbdmProvider {
  readonly name = 'abdm-mock';
  verifyAbhaAddress(): Promise<{ status: 'NOT_CONNECTED' }> {
    return Promise.resolve({ status: 'NOT_CONNECTED' });
  }
  linkCareContext(): Promise<{ status: 'NOT_CONNECTED' }> {
    return Promise.resolve({ status: 'NOT_CONNECTED' });
  }
  handleConsentRequest(): Promise<{ status: 'NOT_CONNECTED' }> {
    return Promise.resolve({ status: 'NOT_CONNECTED' });
  }
}

export const abdm: AbdmProvider = new MockAbdmProvider();
