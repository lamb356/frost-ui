/**
 * FROST Client
 *
 * Main client class for interacting with the frostd server.
 * Provides methods for authentication, session management, and signing ceremonies.
 */

import type {
  FrostdConfig,
  RequestOptions,
  PublicKey,
  SessionId,
  SessionInfo,
  SessionState,
  MessageType,
  EncryptedMessage,
  SigningCommitment,
  FrostSignatureShare,
  AggregateSignature,
  // Request types
  ChallengeRequest,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  GetSessionInfoRequest,
  GetSessionInfoResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  CloseSessionRequest,
  CloseSessionResponse,
  SendMessageRequest,
  SendMessageResponse,
  ReceiveMessagesRequest,
  ReceiveMessagesResponse,
  StartSigningRequest,
  StartSigningResponse,
  SubmitCommitmentRequest,
  SubmitCommitmentResponse,
  GetCommitmentsRequest,
  GetCommitmentsResponse,
  SubmitSignatureShareRequest,
  SubmitSignatureShareResponse,
  AggregateSignatureRequest,
  AggregateSignatureResponse,
} from '@/types';
import { HttpClient } from './http-client';
import { AuthenticationError } from './errors';

/**
 * Event types emitted by the client.
 */
export type FrostClientEvent =
  | { type: 'authenticated'; token: string }
  | { type: 'logged_out' }
  | { type: 'session_created'; session: SessionInfo }
  | { type: 'session_joined'; session: SessionInfo; participantId: number }
  | { type: 'token_expired' };

/**
 * Event handler type.
 */
export type FrostClientEventHandler = (event: FrostClientEvent) => void;

/**
 * Main client for interacting with the frostd server.
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
    // Check if token has expired
    if (this.tokenExpiresAt && Date.now() / 1000 > this.tokenExpiresAt) {
      this.logout();
      return false;
    }
    return true;
  }

  /**
   * Get an authentication challenge from the server.
   */
  async getChallenge(
    pubkey: PublicKey,
    options?: RequestOptions
  ): Promise<ChallengeResponse> {
    const request: ChallengeRequest = { pubkey };
    return this.http.postUnauthenticated<ChallengeRequest, ChallengeResponse>(
      '/challenge',
      request,
      options
    );
  }

  /**
   * Authenticate with the server using a signed challenge.
   */
  async login(
    pubkey: PublicKey,
    challenge: string,
    signature: string,
    options?: RequestOptions
  ): Promise<LoginResponse> {
    const request: LoginRequest = { pubkey, challenge, signature };
    const response = await this.http.postUnauthenticated<LoginRequest, LoginResponse>(
      '/login',
      request,
      options
    );

    // Store the token
    this.http.setToken(response.token);
    this.tokenExpiresAt = response.expiresAt;

    // Emit authenticated event
    this.emit({ type: 'authenticated', token: response.token });

    return response;
  }

  /**
   * Log out and clear the authentication token.
   */
  logout(): void {
    this.http.setToken(null);
    this.tokenExpiresAt = null;
    this.emit({ type: 'logged_out' });
  }

  /**
   * Set an existing token (e.g., from storage).
   */
  setToken(token: string, expiresAt?: number): void {
    this.http.setToken(token);
    this.tokenExpiresAt = expiresAt ?? null;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Create a new signing session (coordinator only).
   */
  async createSession(
    params: {
      name: string;
      threshold: number;
      maxParticipants: number;
      durationSeconds?: number;
      description?: string;
    },
    options?: RequestOptions
  ): Promise<CreateSessionResponse> {
    this.ensureAuthenticated();

    const request: CreateSessionRequest = {
      name: params.name,
      threshold: params.threshold,
      maxParticipants: params.maxParticipants,
      durationSeconds: params.durationSeconds,
      description: params.description,
    };

    const response = await this.http.post<CreateSessionRequest, CreateSessionResponse>(
      '/create_new_session',
      request,
      options
    );

    this.emit({ type: 'session_created', session: response.session });

    return response;
  }

  /**
   * List available sessions.
   */
  async listSessions(
    params: {
      state?: SessionState | SessionState[];
      participating?: boolean;
      coordinating?: boolean;
      limit?: number;
      offset?: number;
    } = {},
    options?: RequestOptions
  ): Promise<ListSessionsResponse> {
    this.ensureAuthenticated();

    const request: ListSessionsRequest = {
      state: params.state,
      participating: params.participating,
      coordinating: params.coordinating,
      limit: params.limit,
      offset: params.offset,
    };

    return this.http.post<ListSessionsRequest, ListSessionsResponse>(
      '/list_sessions',
      request,
      options
    );
  }

  /**
   * Get detailed information about a session.
   */
  async getSessionInfo(
    sessionId: SessionId,
    options?: RequestOptions
  ): Promise<GetSessionInfoResponse> {
    this.ensureAuthenticated();

    const request: GetSessionInfoRequest = { sessionId };
    return this.http.post<GetSessionInfoRequest, GetSessionInfoResponse>(
      '/get_session_info',
      request,
      options
    );
  }

  /**
   * Join a session as a participant.
   */
  async joinSession(
    sessionId: SessionId,
    inviteCode: string,
    options?: RequestOptions
  ): Promise<JoinSessionResponse> {
    this.ensureAuthenticated();

    const request: JoinSessionRequest = { sessionId, inviteCode };
    const response = await this.http.post<JoinSessionRequest, JoinSessionResponse>(
      '/join_session',
      request,
      options
    );

    this.emit({
      type: 'session_joined',
      session: response.session,
      participantId: response.participantId,
    });

    return response;
  }

  /**
   * Close a session (coordinator only).
   */
  async closeSession(
    sessionId: SessionId,
    reason?: string,
    options?: RequestOptions
  ): Promise<CloseSessionResponse> {
    this.ensureAuthenticated();

    const request: CloseSessionRequest = { sessionId, reason };
    return this.http.post<CloseSessionRequest, CloseSessionResponse>(
      '/close_session',
      request,
      options
    );
  }

  // ===========================================================================
  // Messaging
  // ===========================================================================

  /**
   * Send an encrypted message to participants.
   */
  async sendMessage(
    params: {
      sessionId: SessionId;
      recipient: PublicKey | 'broadcast';
      messageType: MessageType;
      ciphertext: string;
      nonce: string;
    },
    options?: RequestOptions
  ): Promise<SendMessageResponse> {
    this.ensureAuthenticated();

    const request: SendMessageRequest = {
      sessionId: params.sessionId,
      recipient: params.recipient,
      messageType: params.messageType,
      ciphertext: params.ciphertext,
      nonce: params.nonce,
    };

    return this.http.post<SendMessageRequest, SendMessageResponse>(
      '/send',
      request,
      options
    );
  }

  /**
   * Receive encrypted messages.
   */
  async receiveMessages(
    params: {
      sessionId: SessionId;
      afterMessageId?: string;
      messageTypes?: MessageType[];
      limit?: number;
      timeout?: number;
    },
    options?: RequestOptions
  ): Promise<ReceiveMessagesResponse> {
    this.ensureAuthenticated();

    const request: ReceiveMessagesRequest = {
      sessionId: params.sessionId,
      afterMessageId: params.afterMessageId,
      messageTypes: params.messageTypes,
      limit: params.limit,
      timeout: params.timeout,
    };

    // Use long polling if timeout is specified
    if (params.timeout && params.timeout > 0) {
      return this.http.longPoll<ReceiveMessagesRequest, ReceiveMessagesResponse>(
        '/receive',
        request,
        params.timeout * 1000,
        options
      );
    }

    return this.http.post<ReceiveMessagesRequest, ReceiveMessagesResponse>(
      '/receive',
      request,
      options
    );
  }

  // ===========================================================================
  // Signing Ceremony
  // ===========================================================================

  /**
   * Start the signing ceremony (coordinator only).
   */
  async startSigning(
    params: {
      sessionId: SessionId;
      message: string;
      signerIds: number[];
    },
    options?: RequestOptions
  ): Promise<StartSigningResponse> {
    this.ensureAuthenticated();

    const request: StartSigningRequest = {
      sessionId: params.sessionId,
      message: params.message,
      signerIds: params.signerIds,
    };

    return this.http.post<StartSigningRequest, StartSigningResponse>(
      '/start_signing',
      request,
      options
    );
  }

  /**
   * Submit a commitment for Round 1 of signing.
   */
  async submitCommitment(
    sessionId: SessionId,
    commitment: SigningCommitment,
    options?: RequestOptions
  ): Promise<SubmitCommitmentResponse> {
    this.ensureAuthenticated();

    const request: SubmitCommitmentRequest = { sessionId, commitment };
    return this.http.post<SubmitCommitmentRequest, SubmitCommitmentResponse>(
      '/submit_commitment',
      request,
      options
    );
  }

  /**
   * Get all commitments for Round 2 of signing.
   */
  async getCommitments(
    sessionId: SessionId,
    options?: RequestOptions
  ): Promise<GetCommitmentsResponse> {
    this.ensureAuthenticated();

    const request: GetCommitmentsRequest = { sessionId };
    return this.http.post<GetCommitmentsRequest, GetCommitmentsResponse>(
      '/get_commitments',
      request,
      options
    );
  }

  /**
   * Submit a signature share for Round 2 of signing.
   */
  async submitSignatureShare(
    sessionId: SessionId,
    signatureShare: FrostSignatureShare,
    options?: RequestOptions
  ): Promise<SubmitSignatureShareResponse> {
    this.ensureAuthenticated();

    const request: SubmitSignatureShareRequest = { sessionId, signatureShare };
    return this.http.post<SubmitSignatureShareRequest, SubmitSignatureShareResponse>(
      '/submit_signature_share',
      request,
      options
    );
  }

  /**
   * Aggregate signature shares into final signature (coordinator only).
   */
  async aggregateSignature(
    sessionId: SessionId,
    options?: RequestOptions
  ): Promise<AggregateSignatureResponse> {
    this.ensureAuthenticated();

    const request: AggregateSignatureRequest = { sessionId };
    return this.http.post<AggregateSignatureRequest, AggregateSignatureResponse>(
      '/aggregate',
      request,
      options
    );
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
