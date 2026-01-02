/**
 * FROST Multi-Signature UI Types
 *
 * Re-exports all types from this module.
 */

// Core FROST types (signing ceremonies, keys, etc.)
export * from './frost';

// Protocol message types (wire format) - rename conflicting types
export {
  PROTOCOL_VERSION,
  type MessageEnvelope,
  type MessageType as ProtocolMessageType,
  type SigningPackagePayload,
  type Round1CommitmentPayload,
  type CommitmentsSetPayload,
  type Round2SignatureSharePayload,
  type SignatureResultPayload,
  type AbortPayload,
  type AbortReason,
  type FrostMessage,
  type MessagePayloadMap,
  isMessageType,
  generateMessageId,
  createMessage,
  createSigningPackage,
  createRound1Commitment,
  createCommitmentsSet,
  createRound2SignatureShare,
  createSignatureResult,
  createAbort,
  serializeMessage,
  deserializeMessage,
  messageToHex,
  hexToMessage,
} from './messages';

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
