/**
 * frostd REST API Types
 *
 * Request and response types for all frostd API endpoints.
 */

import type {
  SessionId,
  SessionInfo,
  SessionState,
  PublicKey,
  MessageType,
  EncryptedMessage,
  SigningCommitment,
  FrostSignatureShare,
  AggregateSignature,
  FrostError,
} from './frost';

// =============================================================================
// Authentication API
// =============================================================================

/**
 * POST /challenge - Request authentication challenge
 */
export interface ChallengeRequest {
  /** Client's public key (hex-encoded) */
  pubkey: PublicKey;
}

export interface ChallengeResponse {
  /** Random challenge to be signed (hex-encoded) */
  challenge: string;
  /** Challenge expiration time (Unix timestamp) */
  expiresAt: number;
}

/**
 * POST /login - Authenticate with signed challenge
 */
export interface LoginRequest {
  /** Client's public key (hex-encoded) */
  pubkey: PublicKey;
  /** The challenge that was signed */
  challenge: string;
  /** Signature over the challenge (hex-encoded) */
  signature: string;
}

export interface LoginResponse {
  /** JWT or session token for subsequent requests */
  token: string;
  /** Token expiration time (Unix timestamp) */
  expiresAt: number;
}

// =============================================================================
// Session Management API
// =============================================================================

/**
 * POST /create_new_session - Coordinator creates a new signing session
 */
export interface CreateSessionRequest {
  /** Human-readable session name */
  name: string;
  /** Required signing threshold (t of n) */
  threshold: number;
  /** Maximum number of participants */
  maxParticipants: number;
  /** Session duration in seconds */
  durationSeconds?: number;
  /** Optional description */
  description?: string;
}

export interface CreateSessionResponse {
  /** Created session info */
  session: SessionInfo;
  /** Invite code for participants to join */
  inviteCode: string;
}

/**
 * POST /list_sessions - List available sessions
 */
export interface ListSessionsRequest {
  /** Filter by session state */
  state?: SessionState | SessionState[];
  /** Only show sessions where user is a participant */
  participating?: boolean;
  /** Only show sessions where user is coordinator */
  coordinating?: boolean;
  /** Maximum number of sessions to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface ListSessionsResponse {
  /** List of sessions matching the filter */
  sessions: SessionInfo[];
  /** Total count of matching sessions */
  total: number;
}

/**
 * POST /get_session_info - Get detailed session information
 */
export interface GetSessionInfoRequest {
  /** Session to get info for */
  sessionId: SessionId;
}

export interface GetSessionInfoResponse {
  /** Detailed session info */
  session: SessionInfo;
  /** User's role in this session */
  role: 'coordinator' | 'participant' | 'observer';
  /** Collected commitments (if coordinator or in appropriate state) */
  commitments?: SigningCommitment[];
  /** Collected signature shares (if coordinator and in appropriate state) */
  signatureShares?: FrostSignatureShare[];
  /** Final signature (if completed) */
  aggregateSignature?: AggregateSignature;
}

/**
 * POST /join_session - Participant joins a session
 */
export interface JoinSessionRequest {
  /** Session to join */
  sessionId: SessionId;
  /** Invite code from coordinator */
  inviteCode: string;
}

export interface JoinSessionResponse {
  /** Updated session info */
  session: SessionInfo;
  /** Assigned participant ID */
  participantId: number;
}

/**
 * POST /close_session - End a session
 */
export interface CloseSessionRequest {
  /** Session to close */
  sessionId: SessionId;
  /** Reason for closing */
  reason?: string;
}

export interface CloseSessionResponse {
  /** Whether session was successfully closed */
  success: boolean;
  /** Final session state */
  session: SessionInfo;
}

// =============================================================================
// Messaging API
// =============================================================================

/**
 * POST /send - Send encrypted message to participants
 */
export interface SendMessageRequest {
  /** Session context */
  sessionId: SessionId;
  /** Recipient public key or 'broadcast' */
  recipient: PublicKey | 'broadcast';
  /** Type of message */
  messageType: MessageType;
  /** Encrypted payload (base64) */
  ciphertext: string;
  /** Encryption nonce (base64) */
  nonce: string;
}

export interface SendMessageResponse {
  /** Assigned message ID */
  messageId: string;
  /** Delivery timestamp */
  timestamp: number;
}

/**
 * POST /receive - Receive encrypted messages
 */
export interface ReceiveMessagesRequest {
  /** Session context */
  sessionId: SessionId;
  /** Only get messages after this ID */
  afterMessageId?: string;
  /** Only get messages of these types */
  messageTypes?: MessageType[];
  /** Maximum number of messages to return */
  limit?: number;
  /** Long-poll timeout in seconds (0 for immediate return) */
  timeout?: number;
}

export interface ReceiveMessagesResponse {
  /** Received messages */
  messages: EncryptedMessage[];
  /** Whether there are more messages available */
  hasMore: boolean;
}

// =============================================================================
// Signing Ceremony API
// =============================================================================

/**
 * POST /start_signing - Coordinator starts the signing ceremony
 */
export interface StartSigningRequest {
  /** Session to start signing in */
  sessionId: SessionId;
  /** Message to be signed (hex-encoded) */
  message: string;
  /** Participant IDs to include in signing (must meet threshold) */
  signerIds: number[];
}

export interface StartSigningResponse {
  /** Updated session info */
  session: SessionInfo;
}

/**
 * POST /submit_commitment - Participant submits Round 1 commitment
 */
export interface SubmitCommitmentRequest {
  /** Session context */
  sessionId: SessionId;
  /** Commitment data */
  commitment: SigningCommitment;
}

export interface SubmitCommitmentResponse {
  /** Whether commitment was accepted */
  accepted: boolean;
  /** Updated session info */
  session: SessionInfo;
}

/**
 * POST /get_commitments - Get all commitments for Round 2
 */
export interface GetCommitmentsRequest {
  /** Session context */
  sessionId: SessionId;
}

export interface GetCommitmentsResponse {
  /** All collected commitments */
  commitments: SigningCommitment[];
  /** Message being signed */
  message: string;
  /** List of signer IDs */
  signerIds: number[];
}

/**
 * POST /submit_signature_share - Participant submits Round 2 signature share
 */
export interface SubmitSignatureShareRequest {
  /** Session context */
  sessionId: SessionId;
  /** Signature share data */
  signatureShare: FrostSignatureShare;
}

export interface SubmitSignatureShareResponse {
  /** Whether share was accepted */
  accepted: boolean;
  /** Updated session info */
  session: SessionInfo;
}

/**
 * POST /aggregate - Coordinator aggregates signature shares
 */
export interface AggregateSignatureRequest {
  /** Session context */
  sessionId: SessionId;
}

export interface AggregateSignatureResponse {
  /** The aggregate signature */
  signature: AggregateSignature;
  /** Whether signature verifies correctly */
  valid: boolean;
  /** Updated session info */
  session: SessionInfo;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (on success) */
  data?: T;
  /** Error information (on failure) */
  error?: FrostError;
}

/**
 * API request options
 */
export interface RequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * frostd server configuration
 */
export interface FrostdConfig {
  /** Server base URL */
  baseUrl: string;
  /** Authentication token */
  token?: string;
  /** Default request timeout in milliseconds */
  defaultTimeout?: number;
  /** Whether to use WebSocket for real-time updates */
  useWebSocket?: boolean;
  /** WebSocket URL (if different from HTTP) */
  wsUrl?: string;
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

/** WebSocket event types */
export type WsEventType =
  | 'session_updated'
  | 'participant_joined'
  | 'participant_left'
  | 'commitment_received'
  | 'signature_share_received'
  | 'signing_started'
  | 'signing_completed'
  | 'session_closed'
  | 'message_received'
  | 'error';

/**
 * WebSocket event payload
 */
export interface WsEvent<T = unknown> {
  /** Event type */
  type: WsEventType;
  /** Session this event relates to */
  sessionId: SessionId;
  /** Event timestamp */
  timestamp: number;
  /** Event-specific payload */
  payload: T;
}

/**
 * Session updated event payload
 */
export interface SessionUpdatedPayload {
  session: SessionInfo;
  changedFields: (keyof SessionInfo)[];
}

/**
 * Participant joined event payload
 */
export interface ParticipantJoinedPayload {
  pubkey: PublicKey;
  participantId: number;
}

/**
 * Signing completed event payload
 */
export interface SigningCompletedPayload {
  signature: AggregateSignature;
  valid: boolean;
}
