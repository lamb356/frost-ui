/**
 * Mock FROST Client
 *
 * Simulates the frostd server for demo/testing purposes.
 * Implements the same interface as FrostClient matching the official spec:
 * https://frost.zfnd.org/zcash/server.html
 */

import type {
  FrostdConfig,
  RequestOptions,
  PublicKey,
  SessionId,
  ChallengeResponse,
  LoginResponse,
  CreateSessionResponse,
  ListSessionsResponse,
  GetSessionInfoResponse,
  ReceivedMessage,
} from '@/types/api';
import type { FrostClientEvent, FrostClientEventHandler } from './client';

// =============================================================================
// Configuration
// =============================================================================

/** Minimum simulated delay in ms */
const MIN_DELAY = 200;

/** Maximum simulated delay in ms */
const MAX_DELAY = 800;

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

/** Generate a UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Simulate network delay */
async function simulateDelay(min = MIN_DELAY, max = MAX_DELAY): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Generate a mock Ed25519 public key (32 bytes) */
function mockPubkey(): PublicKey {
  return randomHex(32);
}

// =============================================================================
// Mock Client Implementation
// =============================================================================

export class MockFrostClient {
  private eventHandlers: Set<FrostClientEventHandler> = new Set();
  private tokenExpiresAt: number | null = null;
  private accessToken: string | null = null;
  private currentPubkey: PublicKey | null = null;

  // Mock state
  private sessions: Map<SessionId, MockSession> = new Map();
  private messageQueues: Map<string, ReceivedMessage[]> = new Map();

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
    if (!this.accessToken) return false;
    if (this.tokenExpiresAt && Date.now() > this.tokenExpiresAt) {
      this.logout();
      return false;
    }
    return true;
  }

  /**
   * GET /challenge - returns UUID challenge
   */
  async getChallenge(_options?: RequestOptions): Promise<ChallengeResponse> {
    await simulateDelay(100, 300);

    return {
      challenge: generateUUID(),
    };
  }

  /**
   * POST /login - authenticate with signed challenge
   */
  async login(
    challenge: string,
    pubkey: PublicKey,
    _signature: string,
    _options?: RequestOptions
  ): Promise<LoginResponse> {
    await simulateDelay(200, 500);

    // In mock mode, accept any signature
    this.currentPubkey = pubkey;
    this.accessToken = `mock-token-${randomHex(16)}`;
    this.tokenExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    console.log(`[Demo] Authenticated with pubkey: ${pubkey.slice(0, 16)}...`);
    console.log(`[Demo] Challenge was: ${challenge}`);

    this.emit({ type: 'authenticated', accessToken: this.accessToken });

    return {
      access_token: this.accessToken,
    };
  }

  /**
   * POST /logout - invalidate access token
   */
  async logout(_options?: RequestOptions): Promise<void> {
    await simulateDelay(50, 150);
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.emit({ type: 'logged_out' });
  }

  setAccessToken(token: string, expiresAt?: number): void {
    this.accessToken = token;
    this.tokenExpiresAt = expiresAt ?? Date.now() + 60 * 60 * 1000;
  }

  // ===========================================================================
  // Session Management (Mock)
  // ===========================================================================

  /**
   * POST /create_new_session
   */
  async createSession(
    pubkeys: PublicKey[],
    messageCount: number,
    _options?: RequestOptions
  ): Promise<CreateSessionResponse> {
    await simulateDelay();

    const sessionId = generateUUID();

    const session: MockSession = {
      session_id: sessionId,
      pubkeys,
      message_count: messageCount,
      coordinator_pubkey: this.currentPubkey || mockPubkey(),
    };

    this.sessions.set(sessionId, session);

    console.log(`[Demo] Created session: ${sessionId}`);
    console.log(`[Demo] Participants: ${pubkeys.length}, Messages: ${messageCount}`);

    this.emit({ type: 'session_created', sessionId });

    return {
      session_id: sessionId,
    };
  }

  /**
   * POST /list_sessions
   */
  async listSessions(_options?: RequestOptions): Promise<ListSessionsResponse> {
    await simulateDelay(100, 300);

    const sessionIds = Array.from(this.sessions.keys());

    return {
      session_ids: sessionIds,
    };
  }

  /**
   * POST /get_session_info
   */
  async getSessionInfo(
    sessionId: SessionId,
    _options?: RequestOptions
  ): Promise<GetSessionInfoResponse> {
    await simulateDelay(100, 300);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return {
      message_count: session.message_count,
      pubkeys: session.pubkeys,
      coordinator_pubkey: session.coordinator_pubkey,
    };
  }

  /**
   * POST /close_session
   */
  async closeSession(sessionId: SessionId, _options?: RequestOptions): Promise<void> {
    await simulateDelay(100, 300);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.sessions.delete(sessionId);
    console.log(`[Demo] Closed session: ${sessionId}`);
  }

  // ===========================================================================
  // Messaging (Mock)
  // ===========================================================================

  /**
   * POST /send - send encrypted message
   */
  async send(
    sessionId: SessionId,
    recipients: PublicKey[],
    msg: string,
    _options?: RequestOptions
  ): Promise<void> {
    await simulateDelay(100, 300);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Store message for each recipient
    const senderPubkey = this.currentPubkey || mockPubkey();
    const targetRecipients = recipients.length > 0 ? recipients : [session.coordinator_pubkey];

    for (const recipient of targetRecipients) {
      const queueKey = `${sessionId}:${recipient}`;
      const queue = this.messageQueues.get(queueKey) || [];
      queue.push({
        sender: senderPubkey,
        msg,
      });
      this.messageQueues.set(queueKey, queue);
    }

    console.log(`[Demo] Sent message to ${targetRecipients.length} recipient(s)`);
  }

  /**
   * POST /receive - receive encrypted messages
   */
  async receive(
    sessionId: SessionId,
    asCoordinator: boolean,
    _options?: RequestOptions
  ): Promise<ReceivedMessage[]> {
    await simulateDelay(100, 300);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Get messages for this user
    const myPubkey = asCoordinator ? session.coordinator_pubkey : (this.currentPubkey || mockPubkey());
    const queueKey = `${sessionId}:${myPubkey}`;
    const messages = this.messageQueues.get(queueKey) || [];

    // Clear the queue after reading
    this.messageQueues.set(queueKey, []);

    if (messages.length > 0) {
      console.log(`[Demo] Received ${messages.length} message(s)`);
    }

    return messages;
  }

  // ===========================================================================
  // Polling Helper
  // ===========================================================================

  async pollMessages(
    sessionId: SessionId,
    asCoordinator: boolean,
    intervalMs: number,
    signal: AbortSignal,
    onMessages: (messages: ReceivedMessage[]) => void
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        const messages = await this.receive(sessionId, asCoordinator);
        if (messages.length > 0) {
          onMessages(messages);
        }
      } catch (error) {
        if (signal.aborted) break;
        console.error('[Demo] Polling error:', error);
      }

      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, intervalMs);
        signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
      });
    }
  }

  // ===========================================================================
  // Demo Helpers
  // ===========================================================================

  /**
   * Simulate receiving a message (for demo purposes).
   * Call this to inject a message as if from another participant.
   */
  injectMessage(sessionId: SessionId, sender: PublicKey, msg: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Inject for coordinator
    const queueKey = `${sessionId}:${session.coordinator_pubkey}`;
    const queue = this.messageQueues.get(queueKey) || [];
    queue.push({ sender, msg });
    this.messageQueues.set(queueKey, queue);

    console.log(`[Demo] Injected message from ${sender.slice(0, 8)}...`);
  }

  /**
   * Get current state for debugging.
   */
  getDebugState(): { sessions: MockSession[]; messageQueues: Map<string, ReceivedMessage[]> } {
    return {
      sessions: Array.from(this.sessions.values()),
      messageQueues: this.messageQueues,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

interface MockSession {
  session_id: SessionId;
  pubkeys: PublicKey[];
  message_count: number;
  coordinator_pubkey: PublicKey;
}
