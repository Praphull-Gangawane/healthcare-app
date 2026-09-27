export interface TeleconsultationInput {
  appointmentId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface TeleconsultationSession {
  sessionRef: string;
  provider: string;
}

export interface JoinToken {
  token: string;
  expiresAt: Date;
  /** Room URL for the provider's SDK — never a public, unauthenticated link. */
  roomUrl: string;
}

export interface TeleconsultationProvider {
  readonly name: string;
  createSession(input: TeleconsultationInput): Promise<TeleconsultationSession>;
  issueJoinToken(sessionRef: string, participant: { userId: string; role: 'HOST' | 'PATIENT' }): Promise<JoinToken>;
  endSession(sessionRef: string): Promise<void>;
}
