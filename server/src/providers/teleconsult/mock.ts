import crypto from 'node:crypto';
import { signPayload } from '../../lib/crypto.js';
import type { JoinToken, TeleconsultationInput, TeleconsultationProvider, TeleconsultationSession } from './types.js';

/** Mock video provider: issues signed, short-lived, participant-bound join tokens. No media. */
export class MockTeleconsultationProvider implements TeleconsultationProvider {
  readonly name = 'mock-video';

  createSession(input: TeleconsultationInput): Promise<TeleconsultationSession> {
    return Promise.resolve({ sessionRef: `mockroom_${input.appointmentId}_${crypto.randomUUID().slice(0, 8)}`, provider: this.name });
  }

  issueJoinToken(sessionRef: string, participant: { userId: string; role: 'HOST' | 'PATIENT' }): Promise<JoinToken> {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const token = signPayload({ r: sessionRef, u: participant.userId, role: participant.role, exp: expiresAt.getTime() });
    return Promise.resolve({ token, expiresAt, roomUrl: `mock-video://${sessionRef}` });
  }

  endSession(): Promise<void> {
    return Promise.resolve();
  }
}
