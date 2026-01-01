/**
 * Mock FROST Client
 *
 * Simulates the frostd server for demo/testing purposes.
 * Implements the same interface as FrostClient with realistic delays and mock data.
 */

import type {
  FrostdConfig,
  RequestOptions,
  PublicKey,
  SessionId,
  SessionInfo,
  SessionState,
  ParticipantInfo,
  MessageType,
  EncryptedMessage,
  SigningCommitment,
  FrostSignatureShare,
  AggregateSignature,
  ChallengeResponse,
  LoginResponse,
  CreateSessionResponse,
  ListSessionsResponse,
  GetSessionInfoResponse,
  JoinSessionResponse,
  CloseSessionResponse,
  SendMessageResponse,
  ReceiveMessagesResponse,
  StartSigningResponse,
  SubmitCommitmentResponse,
  GetCommitmentsResponse,
  SubmitSignatureShareResponse,
  AggregateSignatureResponse,
} from '@/types';
import type { FrostClientEvent, FrostClientEventHandler } from './client';

// =============================================================================
// Configuration
// =============================================================================

/** Probability of simulated random failure (10%) */
const FAILURE_PROBABILITY = 0.1;

/** Minimum simulated delay in ms */
const MIN_DELAY = 500;

/** Maximum simulated delay in ms */
const MAX_DELAY = 2000;

/** Number of simulated participants that will join */
const SIMULATED_PARTICIPANTS = 3;

// =============================================================================
// Helpers
// =============================================================================

/** Generate a random hex string */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a random session ID */
function generateSessionId(): SessionId {
  return `session-${randomHex(8)}`;
}

/** Simulate network delay */
async function simulateDelay(min = MIN_DELAY, max = MAX_DELAY): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Maybe throw a random error (for testing error handling) */
function maybeThrowError(context: string): void {
  if (Math.random() < FAILURE_PROBABILITY) {
    throw new Error(`Simulated ${context} failure - this is expected in demo mode`);
  }
}

/** Generate a mock public key */
function mockPubkey(): PublicKey {
  return randomHex(33); // 33 bytes for compressed public key
}

/** Generate mock participant names */
const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

// =============================================================================
// Mock Client Implementation
// =============================================================================

export class MockFrostClient {
  private eventHandlers: Set<FrostClientEventHandler> = new Set();
  private tokenExpiresAt: number | null = null;
  private token: string | null = null;
  private currentPubkey: PublicKey | null = null;

  // Mock state
  private sessions: Map<SessionId, MockSession> = new Map();
  private currentSession: MockSession | null = null;
  private signingSimulationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(_config: FrostdConfig) {
    // Config not used in mock client
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  on(handler: FrostClientEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: FrostClientEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    }
  }

  // ===========================================================================
  // Authentication (Mock)
  // ===========================================================================

  isAuthenticated(): boolean {
    if (!this.token) return false;
    if (this.tokenExpiresAt && Date.now() / 1000 > this.tokenExpiresAt) {
      this.logout();
      return false;
    }
    return true;
  }

  async getChallenge(
    pubkey: PublicKey,
    _options?: RequestOptions
  ): Promise<ChallengeResponse> {
    await simulateDelay(300, 800);

    this.currentPubkey = pubkey;

    return {
      challenge: randomHex(32),
      expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    };
  }

  async login(
    pubkey: PublicKey,
    _challenge: string,
    _signature: string,
    _options?: RequestOptions
  ): Promise<LoginResponse> {
    await simulateDelay(500, 1000);

    this.currentPubkey = pubkey;
    this.token = `mock-token-${randomHex(16)}`;
    this.tokenExpiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    this.emit({ type: 'authenticated', token: this.token });

    return {
      token: this.token,
      expiresAt: this.tokenExpiresAt,
    };
  }

  logout(): void {
    this.token = null;
    this.tokenExpiresAt = null;
    this.emit({ type: 'logged_out' });
  }

  setToken(token: string, expiresAt?: number): void {
    this.token = token;
    this.tokenExpiresAt = expiresAt ?? null;
  }

  // ===========================================================================
  // Session Management (Mock)
  // ===========================================================================

  async createSession(
    params: {
      name: string;
      threshold: number;
      maxParticipants: number;
      durationSeconds?: number;
      description?: string;
    },
    _options?: RequestOptions
  ): Promise<CreateSessionResponse> {
    await simulateDelay();
    maybeThrowError('session creation');

    const sessionId = generateSessionId();
    const now = Math.floor(Date.now() / 1000);

    const session: SessionInfo = {
      sessionId,
      name: params.name,
      coordinatorPubkey: this.currentPubkey || mockPubkey(),
      state: 'created',
      threshold: params.threshold,
      maxParticipants: params.maxParticipants,
      participants: [],
      createdAt: now,
      expiresAt: now + (params.durationSeconds || 3600),
    };

    const mockSession: MockSession = {
      info: session,
      inviteCode: `DEMO-${randomHex(4).toUpperCase()}`,
      commitments: [],
      signatureShares: [],
      messages: [],
    };

    this.sessions.set(sessionId, mockSession);
    this.currentSession = mockSession;

    this.emit({ type: 'session_created', session });

    // Start simulating participants joining
    this.simulateParticipantsJoining(mockSession);

    return {
      session,
      inviteCode: mockSession.inviteCode,
    };
  }

  async listSessions(
    _params: {
      state?: SessionState | SessionState[];
      participating?: boolean;
      coordinating?: boolean;
      limit?: number;
      offset?: number;
    } = {},
    _options?: RequestOptions
  ): Promise<ListSessionsResponse> {
    await simulateDelay(300, 600);

    const sessions = Array.from(this.sessions.values()).map((s) => s.info);

    return {
      sessions,
      total: sessions.length,
    };
  }

  async getSessionInfo(
    sessionId: SessionId,
    _options?: RequestOptions
  ): Promise<GetSessionInfoResponse> {
    await simulateDelay(200, 500);

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    return {
      session: mockSession.info,
      role: 'coordinator',
      commitments: mockSession.commitments,
      signatureShares: mockSession.signatureShares,
      aggregateSignature: mockSession.aggregateSignature,
    };
  }

  async joinSession(
    sessionId: SessionId,
    inviteCode: string,
    _options?: RequestOptions
  ): Promise<JoinSessionResponse> {
    await simulateDelay();
    maybeThrowError('join session');

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    if (mockSession.inviteCode !== inviteCode) {
      throw new Error('Invalid invite code');
    }

    const participantId = mockSession.info.participants.length + 1;

    const participant: ParticipantInfo = {
      pubkey: this.currentPubkey || mockPubkey(),
      participantId,
      hasCommitment: false,
      hasSignatureShare: false,
      joinedAt: Math.floor(Date.now() / 1000),
    };

    mockSession.info.participants.push(participant);

    this.emit({
      type: 'session_joined',
      session: mockSession.info,
      participantId,
    });

    return {
      session: mockSession.info,
      participantId,
    };
  }

  async closeSession(
    sessionId: SessionId,
    _reason?: string,
    _options?: RequestOptions
  ): Promise<CloseSessionResponse> {
    await simulateDelay(300, 600);

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    mockSession.info.state = 'closed';

    return {
      success: true,
      session: mockSession.info,
    };
  }

  // ===========================================================================
  // Messaging (Mock)
  // ===========================================================================

  async sendMessage(
    params: {
      sessionId: SessionId;
      recipient: PublicKey | 'broadcast';
      messageType: MessageType;
      ciphertext: string;
      nonce: string;
    },
    _options?: RequestOptions
  ): Promise<SendMessageResponse> {
    await simulateDelay(200, 400);

    const mockSession = this.sessions.get(params.sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    const messageId = `msg-${randomHex(8)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const message: EncryptedMessage = {
      id: messageId,
      senderPubkey: this.currentPubkey || mockPubkey(),
      recipientPubkey: params.recipient,
      messageType: params.messageType,
      ciphertext: params.ciphertext,
      nonce: params.nonce,
      timestamp,
    };

    mockSession.messages.push(message);

    return {
      messageId,
      timestamp,
    };
  }

  async receiveMessages(
    params: {
      sessionId: SessionId;
      afterMessageId?: string;
      messageTypes?: MessageType[];
      limit?: number;
      timeout?: number;
    },
    _options?: RequestOptions
  ): Promise<ReceiveMessagesResponse> {
    // Simulate long-poll delay
    const delay = params.timeout ? Math.min(params.timeout * 1000, MAX_DELAY) : 500;
    await simulateDelay(delay / 2, delay);

    const mockSession = this.sessions.get(params.sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    // Return empty for now - messages are simulated differently
    return {
      messages: [],
      hasMore: false,
    };
  }

  // ===========================================================================
  // Signing Ceremony (Mock)
  // ===========================================================================

  async startSigning(
    params: {
      sessionId: SessionId;
      message: string;
      signerIds: number[];
    },
    _options?: RequestOptions
  ): Promise<StartSigningResponse> {
    await simulateDelay();
    maybeThrowError('start signing');

    const mockSession = this.sessions.get(params.sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    mockSession.info.message = params.message;
    mockSession.info.state = 'collecting_commitments';

    // Simulate participants submitting commitments
    this.simulateCommitments(mockSession, params.signerIds);

    return {
      session: mockSession.info,
    };
  }

  async submitCommitment(
    sessionId: SessionId,
    commitment: SigningCommitment,
    _options?: RequestOptions
  ): Promise<SubmitCommitmentResponse> {
    await simulateDelay(300, 600);

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    mockSession.commitments.push(commitment);

    // Update participant status
    const participant = mockSession.info.participants.find(
      (p) => p.participantId === commitment.participantId
    );
    if (participant) {
      participant.hasCommitment = true;
    }

    return {
      accepted: true,
      session: mockSession.info,
    };
  }

  async getCommitments(
    sessionId: SessionId,
    _options?: RequestOptions
  ): Promise<GetCommitmentsResponse> {
    await simulateDelay(200, 400);

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    const signerIds = mockSession.info.participants
      .filter((p) => p.hasCommitment)
      .map((p) => p.participantId);

    return {
      commitments: mockSession.commitments,
      message: mockSession.info.message || '',
      signerIds,
    };
  }

  async submitSignatureShare(
    sessionId: SessionId,
    signatureShare: FrostSignatureShare,
    _options?: RequestOptions
  ): Promise<SubmitSignatureShareResponse> {
    await simulateDelay(300, 600);

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    mockSession.signatureShares.push(signatureShare);

    // Update participant status
    const participant = mockSession.info.participants.find(
      (p) => p.participantId === signatureShare.participantId
    );
    if (participant) {
      participant.hasSignatureShare = true;
    }

    // Check if we have enough shares
    if (mockSession.signatureShares.length >= mockSession.info.threshold) {
      mockSession.info.state = 'aggregating';
    }

    return {
      accepted: true,
      session: mockSession.info,
    };
  }

  async aggregateSignature(
    sessionId: SessionId,
    _options?: RequestOptions
  ): Promise<AggregateSignatureResponse> {
    await simulateDelay(1000, 2000);
    maybeThrowError('signature aggregation');

    const mockSession = this.sessions.get(sessionId);
    if (!mockSession) {
      throw new Error('Session not found');
    }

    // Generate mock aggregate signature
    const signature: AggregateSignature = randomHex(64);
    mockSession.aggregateSignature = signature;
    mockSession.info.state = 'completed';

    return {
      signature,
      valid: true,
      session: mockSession.info,
    };
  }

  // ===========================================================================
  // Simulation Helpers
  // ===========================================================================

  /**
   * Simulate participants joining the session.
   */
  private simulateParticipantsJoining(mockSession: MockSession): void {
    const addParticipant = (index: number) => {
      if (index >= SIMULATED_PARTICIPANTS) return;
      if (mockSession.info.state !== 'created') return;

      const delay = 1000 + Math.random() * 2000;
      setTimeout(() => {
        const participant: ParticipantInfo = {
          pubkey: mockPubkey(),
          participantId: index + 1,
          hasCommitment: false,
          hasSignatureShare: false,
          joinedAt: Math.floor(Date.now() / 1000),
        };

        mockSession.info.participants.push(participant);

        console.log(
          `[Demo] ${PARTICIPANT_NAMES[index]} joined the session (${index + 1}/${SIMULATED_PARTICIPANTS})`
        );

        addParticipant(index + 1);
      }, delay);
    };

    // Start adding participants after a short delay
    setTimeout(() => addParticipant(0), 1500);
  }

  /**
   * Simulate participants submitting commitments.
   */
  private simulateCommitments(mockSession: MockSession, signerIds: number[]): void {
    signerIds.forEach((signerId, index) => {
      const delay = 1000 + index * 1000 + Math.random() * 1000;

      setTimeout(() => {
        if (mockSession.info.state !== 'collecting_commitments') return;

        const commitment: SigningCommitment = {
          participantId: signerId,
          hiding: randomHex(32),
          binding: randomHex(32),
        };

        mockSession.commitments.push(commitment);

        const participant = mockSession.info.participants.find(
          (p) => p.participantId === signerId
        );
        if (participant) {
          participant.hasCommitment = true;
        }

        console.log(
          `[Demo] ${PARTICIPANT_NAMES[signerId - 1] || `Participant ${signerId}`} submitted commitment`
        );

        // Check if all commitments are in
        if (mockSession.commitments.length >= mockSession.info.threshold) {
          mockSession.info.state = 'signing';
          console.log('[Demo] All commitments received, starting Round 2');

          // Simulate signature shares
          this.simulateSignatureShares(mockSession, signerIds);
        }
      }, delay);
    });
  }

  /**
   * Simulate participants submitting signature shares.
   */
  private simulateSignatureShares(mockSession: MockSession, signerIds: number[]): void {
    signerIds.forEach((signerId, index) => {
      const delay = 1500 + index * 1000 + Math.random() * 1000;

      setTimeout(() => {
        if (mockSession.info.state !== 'signing') return;

        const share: FrostSignatureShare = {
          participantId: signerId,
          share: randomHex(32),
        };

        mockSession.signatureShares.push(share);

        const participant = mockSession.info.participants.find(
          (p) => p.participantId === signerId
        );
        if (participant) {
          participant.hasSignatureShare = true;
        }

        console.log(
          `[Demo] ${PARTICIPANT_NAMES[signerId - 1] || `Participant ${signerId}`} submitted signature share`
        );

        // Check if all shares are in
        if (mockSession.signatureShares.length >= mockSession.info.threshold) {
          mockSession.info.state = 'aggregating';
          console.log('[Demo] All signature shares received, ready for aggregation');
        }
      }, delay);
    });
  }

  /**
   * Get current session for status updates.
   */
  getCurrentSession(): MockSession | null {
    return this.currentSession;
  }

  /**
   * Clean up any running simulations.
   */
  cleanup(): void {
    if (this.signingSimulationTimer) {
      clearTimeout(this.signingSimulationTimer);
      this.signingSimulationTimer = null;
    }
  }
}

// =============================================================================
// Types
// =============================================================================

interface MockSession {
  info: SessionInfo;
  inviteCode: string;
  commitments: SigningCommitment[];
  signatureShares: FrostSignatureShare[];
  aggregateSignature?: AggregateSignature;
  messages: EncryptedMessage[];
}
