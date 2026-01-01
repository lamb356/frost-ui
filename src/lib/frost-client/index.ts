/**
 * FROST Client Library
 *
 * TypeScript client for the frostd REST API.
 * Implements the official spec: https://frost.zfnd.org/zcash/server.html
 */

// Main client class
export { FrostClient, type FrostClientEvent, type FrostClientEventHandler } from './client';

// Mock client for demo mode
export { MockFrostClient } from './mock-client';

// HTTP client (for advanced usage)
export { HttpClient } from './http-client';

// Error types
export {
  FrostClientError,
  NetworkError,
  AuthenticationError,
  SessionError,
  EncryptionError,
  ProtocolError,
  isFrostClientError,
  toFrostClientError,
} from './errors';

// Re-export types for convenience
export type {
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
  CloseSessionResponse,
  SendRequest,
  SendResponse,
  ReceiveRequest,
  ReceiveResponse,
  ReceivedMessage,
  FrostError,
  FrostErrorCode,
} from '@/types/api';
