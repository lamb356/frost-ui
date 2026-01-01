/**
 * FROST Client
 *
 * Client for interacting with the frostd server.
 * Implements the official frostd spec: https://frost.zfnd.org/zcash/server.html
 *
 * Endpoints:
 * - POST /challenge - Get authentication challenge (returns UUID)
 * - POST /login - Authenticate with signed challenge
 * - POST /logout - Invalidate access token
 * - POST /create_new_session - Create signing session (coordinator)
 * - POST /list_sessions - List user's sessions
 * - POST /get_session_info - Get session details
 * - POST /send - Send encrypted message
 * - POST /receive - Receive encrypted messages (polling)
 * - POST /close_session - Close session (coordinator)
 */

import type {
  FrostdConfig,
  RequestOptions,
  PublicKey,
  SessionId,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ListSessionsResponse,
  GetSessionInfoRequest,
  GetSessionInfoResponse,
  CloseSessionRequest,
  SendRequest,
  ReceiveRequest,
  ReceiveResponse,
  ReceivedMessage,
} from '@/types/api';
import { HttpClient } from './http-client';
import { AuthenticationError } from './errors';

/**
 * Event types emitted by the client.
 */
export type FrostClientEvent =
  | { type: 'authenticated'; accessToken: string }
  | { type: 'logged_out' }
  | { type: 'session_created'; sessionId: SessionId }
  | { type: 'token_expired' };

/**
 * Event handler type.
 */
export type FrostClientEventHandler = (event: FrostClientEvent) => void;

/**
 * Main client for interacting with the frostd server.
 * Implements the official frostd REST API.
 */
export class FrostClient {
  private http: HttpClient;
  private eventHandlers: Set<FrostClientEventHandler> = new Set();
  private tokenExpiresAt: number | null = null;

  constructor(config: FrostdConfig) {
    this.http = new HttpClient(config);
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Subscribe to client events.
   */
  on(handler: FrostClientEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all handlers.
   */
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
  // Authentication
  // ===========================================================================

  /**
   * Check if the client is authenticated.
   */
  isAuthenticated(): boolean {
    if (!this.http.isAuthenticated()) {
      return false;
    }
    // Check if token has expired (tokens valid for 1 hour)
    if (this.tokenExpiresAt && Date.now() > this.tokenExpiresAt) {
      this.logout();
      return false;
    }
    return true;
  }

  /**
   * Get an authentication challenge from the server.
   * POST /challenge - no request body required
   */
  async getChallenge(options?: RequestOptions): Promise<ChallengeResponse> {
    return this.http.postUnauthenticated<Record<string, never>, ChallengeResponse>(
      '/challenge',
      {},
      options
    );
  }

  /**
   * Authenticate with the server using a signed challenge.
   * POST /login
   *
   * @param challenge - UUID challenge from /challenge
   * @param pubkey - Ed25519 public key (hex-encoded)
   * @param signature - XEdDSA signature over challenge UUID bytes (hex-encoded)
   */
  async login(
    challenge: string,
    pubkey: PublicKey,
    signature: string,
    options?: RequestOptions
  ): Promise<LoginResponse> {
    const request: LoginRequest = { challenge, pubkey, signature };
    const response = await this.http.postUnauthenticated<LoginRequest, LoginResponse>(
      '/login',
      request,
      options
    );

    // Store the token (valid for 1 hour)
    this.http.setAccessToken(response.access_token);
    this.tokenExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    // Emit authenticated event
    this.emit({ type: 'authenticated', accessToken: response.access_token });

    return response;
  }

  /**
   * Log out and invalidate the access token.
   * POST /logout
   */
  async logout(options?: RequestOptions): Promise<void> {
    if (this.http.isAuthenticated()) {
      try {
        await this.http.post('/logout', {}, options);
      } catch {
        // Ignore errors during logout
      }
    }
    this.http.setAccessToken(null);
    this.tokenExpiresAt = null;
    this.emit({ type: 'logged_out' });
  }

  /**
   * Set an existing access token (e.g., from storage).
   */
  setAccessToken(token: string, expiresAt?: number): void {
    this.http.setAccessToken(token);
    this.tokenExpiresAt = expiresAt ?? Date.now() + 60 * 60 * 1000;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Create a new signing session (coordinator only).
   * POST /create_new_session
   *
   * @param pubkeys - Public keys of all participants
   * @param messageCount - Number of messages to sign
   */
  async createSession(
    pubkeys: PublicKey[],
    messageCount: number,
    options?: RequestOptions
  ): Promise<CreateSessionResponse> {
    this.ensureAuthenticated();

    const request: CreateSessionRequest = {
      pubkeys,
      message_count: messageCount,
    };

    const response = await this.http.post<CreateSessionRequest, CreateSessionResponse>(
      '/create_new_session',
      request,
      options
    );

    this.emit({ type: 'session_created', sessionId: response.session_id });

    return response;
  }

  /**
   * List sessions for the authenticated user.
   * POST /list_sessions - empty request body
   */
  async listSessions(options?: RequestOptions): Promise<ListSessionsResponse> {
    this.ensureAuthenticated();

    return this.http.post<Record<string, never>, ListSessionsResponse>(
      '/list_sessions',
      {},
      options
    );
  }

  /**
   * Get detailed information about a session.
   * POST /get_session_info
   */
  async getSessionInfo(
    sessionId: SessionId,
    options?: RequestOptions
  ): Promise<GetSessionInfoResponse> {
    this.ensureAuthenticated();

    const request: GetSessionInfoRequest = { session_id: sessionId };
    return this.http.post<GetSessionInfoRequest, GetSessionInfoResponse>(
      '/get_session_info',
      request,
      options
    );
  }

  /**
   * Close a session (coordinator only).
   * POST /close_session
   */
  async closeSession(sessionId: SessionId, options?: RequestOptions): Promise<void> {
    this.ensureAuthenticated();

    const request: CloseSessionRequest = { session_id: sessionId };
    await this.http.post<CloseSessionRequest, Record<string, never>>(
      '/close_session',
      request,
      options
    );
  }

  // ===========================================================================
  // Messaging (for FROST ceremony coordination)
  // ===========================================================================

  /**
   * Send an encrypted message to participants.
   * POST /send
   *
   * Messages MUST be end-to-end encrypted before sending.
   *
   * @param sessionId - Session context
   * @param recipients - Recipient public keys (empty array = send to coordinator)
   * @param msg - Hex-encoded encrypted message
   */
  async send(
    sessionId: SessionId,
    recipients: PublicKey[],
    msg: string,
    options?: RequestOptions
  ): Promise<void> {
    this.ensureAuthenticated();

    const request: SendRequest = {
      session_id: sessionId,
      recipients,
      msg,
    };

    await this.http.post<SendRequest, Record<string, never>>('/send', request, options);
  }

  /**
   * Receive encrypted messages.
   * POST /receive
   *
   * This is a polling endpoint - call repeatedly to get new messages.
   *
   * @param sessionId - Session context
   * @param asCoordinator - True if receiving as coordinator
   */
  async receive(
    sessionId: SessionId,
    asCoordinator: boolean,
    options?: RequestOptions
  ): Promise<ReceivedMessage[]> {
    this.ensureAuthenticated();

    const request: ReceiveRequest = {
      session_id: sessionId,
      as_coordinator: asCoordinator,
    };

    const response = await this.http.post<ReceiveRequest, ReceiveResponse>(
      '/receive',
      request,
      options
    );

    return response.msgs || [];
  }

  // ===========================================================================
  // Polling Helper
  // ===========================================================================

  /**
   * Poll for messages with automatic retry.
   * Useful for implementing the FROST ceremony flow.
   *
   * @param sessionId - Session to poll
   * @param asCoordinator - Whether receiving as coordinator
   * @param intervalMs - Polling interval in milliseconds
   * @param signal - AbortSignal to stop polling
   * @param onMessages - Callback when messages are received
   */
  async pollMessages(
    sessionId: SessionId,
    asCoordinator: boolean,
    intervalMs: number,
    signal: AbortSignal,
    onMessages: (messages: ReceivedMessage[]) => void
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        const messages = await this.receive(sessionId, asCoordinator, { signal });
        if (messages.length > 0) {
          onMessages(messages);
        }
      } catch (error) {
        if (signal.aborted) break;
        console.error('Polling error:', error);
      }

      // Wait for next poll interval
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, intervalMs);
        signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
      });
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Ensure the client is authenticated, throwing if not.
   */
  private ensureAuthenticated(): void {
    if (!this.isAuthenticated()) {
      throw new AuthenticationError('Not authenticated. Please log in first.');
    }
  }
}
