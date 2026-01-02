/**
 * frostd REST API Types
 *
 * Request and response types matching the official frostd spec:
 * https://frost.zfnd.org/zcash/server.html
 */

// =============================================================================
// Common Types
// =============================================================================

/** Hex-encoded public key (Ed25519) */
export type PublicKey = string;

/** Session identifier (UUID) */
export type SessionId = string;

// =============================================================================
// Authentication API
// =============================================================================

/**
 * POST /challenge - Request authentication challenge
 * No request body required
 */
export interface ChallengeResponse {
  /** UUID challenge to be signed */
  challenge: string;
}

/**
 * POST /login - Authenticate with signed challenge
 */
export interface LoginRequest {
  /** The UUID challenge from /challenge */
  challenge: string;
  /** Client's Ed25519 public key (hex-encoded) */
  pubkey: PublicKey;
  /** XEdDSA signature over challenge UUID bytes (hex-encoded) */
  signature: string;
}

export interface LoginResponse {
  /** Bearer token for authenticated requests (valid for 1 hour) */
  access_token: string;
}

/**
 * POST /logout - Invalidate access token
 * Empty request body
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LogoutResponse {
  // Empty response on success
}

// =============================================================================
// Session Management API
// =============================================================================

/**
 * POST /create_new_session - Coordinator creates a new signing session
 */
export interface CreateSessionRequest {
  /** Public keys of all participants (hex-encoded Ed25519 keys) */
  pubkeys: PublicKey[];
  /** Number of messages to sign in this session */
  message_count: number;
}

export interface CreateSessionResponse {
  /** Created session identifier */
  session_id: SessionId;
}

/**
 * POST /list_sessions - List sessions for authenticated user
 * Empty request body
 */
export interface ListSessionsResponse {
  /** Array of session IDs */
  session_ids: SessionId[];
}

/**
 * POST /get_session_info - Get detailed session information
 */
export interface GetSessionInfoRequest {
  /** Session to get info for */
  session_id: SessionId;
}

export interface GetSessionInfoResponse {
  /** Number of messages to sign */
  message_count: number;
  /** Participant public keys */
  pubkeys: PublicKey[];
  /** Coordinator's public key */
  coordinator_pubkey: PublicKey;
}

/**
 * POST /close_session - End a session (coordinator only)
 */
export interface CloseSessionRequest {
  /** Session to close */
  session_id: SessionId;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CloseSessionResponse {
  // Empty response on success
}

// =============================================================================
// Messaging API
// =============================================================================

/**
 * POST /send - Send encrypted message to participants
 * Messages MUST be end-to-end encrypted
 */
export interface SendRequest {
  /** Session context */
  session_id: SessionId;
  /** Recipient public keys (empty array = send to coordinator) */
  recipients: PublicKey[];
  /** Hex-encoded encrypted message */
  msg: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SendResponse {
  // Empty response on success
}

/**
 * POST /receive - Receive encrypted messages
 */
export interface ReceiveRequest {
  /** Session context */
  session_id: SessionId;
  /** True if receiving as coordinator, false as participant */
  as_coordinator: boolean;
}

export interface ReceivedMessage {
  /** Sender's public key */
  sender: PublicKey;
  /** Hex-encoded encrypted message */
  msg: string;
}

export interface ReceiveResponse {
  /** Array of received messages */
  msgs: ReceivedMessage[];
}

// =============================================================================
// Error Types
// =============================================================================

/** Error codes from frostd */
export enum FrostErrorCode {
  INVALID_ARGUMENT = 1,
  UNAUTHORIZED = 2,
  SESSION_NOT_FOUND = 3,
  NOT_COORDINATOR = 4,
}

/**
 * Error response (status code 500)
 */
export interface FrostError {
  /** Error code */
  code: FrostErrorCode;
  /** Error message */
  msg: string;
}

// =============================================================================
// Utility Types
// =============================================================================

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
  /** Authentication token (if already authenticated) */
  accessToken?: string;
  /** Default request timeout in milliseconds */
  defaultTimeout?: number;
}
