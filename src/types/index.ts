/**
 * FROST Multi-Signature UI Types
 *
 * Re-exports all types from this module.
 */

// Core FROST types (signing ceremonies, keys, etc.)
export * from './frost';

// API request/response types (rename conflicting types)
export type {
  // API types (distinct from frost types)
  PublicKey as ApiPublicKey,
  SessionId as ApiSessionId,
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
  FrostdConfig,
  RequestOptions,
  FrostError as ApiFrostError,
  FrostErrorCode as ApiFrostErrorCode,
} from './api';
