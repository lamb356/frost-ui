/**
 * FROST Protocol Message Types
 *
 * Production-ready message envelope and payload types for FROST signing ceremonies.
 * These schemas match the exact wire format used in test-zcash-ceremony-live.ts.
 *
 * Design principles:
 * - Single source of truth = message log
 * - All messages use standard envelope format
 * - Strict validation at ingress
 * - message_id links all messages in a signing attempt
 */

import type { BackendId } from '../lib/frost-backend/types';

// Re-export for convenience
export type { BackendId };

// =============================================================================
// Message Envelope (all messages use this format)
// =============================================================================

/**
 * Current protocol version.
 * Increment when making breaking changes to message format.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Wire envelope format for all FROST protocol messages.
 * Every message transmitted via frostd uses this structure.
 */
export interface MessageEnvelope<T = unknown> {
  /** Protocol version (currently 1) */
  v: typeof PROTOCOL_VERSION;
  /** frostd session_id - binds message to specific session */
  sid: string;
  /** Unique message UUID - for deduplication */
  id: string;
  /** Message type discriminator */
  t: MessageType;
  /** Sender's public key (hex-encoded, 64 chars) */
  from: string;
  /** Timestamp in milliseconds since epoch */
  ts: number;
  /** Message-specific payload */
  payload: T;
}

/**
 * All valid message types in the FROST signing protocol.
 */
export type MessageType =
  | 'SIGNING_PACKAGE'           // coordinator → participants: start signing with message
  | 'ROUND1_COMMITMENT'         // participant → coordinator: Round 1 commitment
  | 'COMMITMENTS_SET'           // coordinator → participants: all commitments collected
  | 'ROUND2_SIGNATURE_SHARE'    // participant → coordinator: Round 2 signature share
  | 'SIGNATURE_RESULT'          // coordinator → all: final aggregate signature
  | 'ABORT';                    // either direction: abort with reason

// =============================================================================
// WASM Output Types (from frost-wasm / frost-zcash-wasm)
// =============================================================================

/**
 * Commitment object as returned by WASM generate_round1_commitment().
 */
export interface WasmCommitment {
  identifier: number;
  commitment: string;  // JSON-encoded commitment data
}

/**
 * Signature share object as returned by WASM generate_round2_signature().
 */
export interface WasmSignatureShare {
  identifier: number;
  share: string;  // hex-encoded signature share
}

// =============================================================================
// Message Payload Types (Canonical Wire Format)
// =============================================================================

/**
 * SIGNING_PACKAGE payload.
 * Sent by coordinator to start a signing ceremony.
 * Matches test-zcash-ceremony-live.ts wire format.
 */
export interface SigningPackagePayload {
  /** FROST backend to use ('ed25519' | 'orchard-redpallas') */
  backendId: BackendId;
  /** Unique identifier for this signing attempt - links all related messages */
  message_id: string;
  /** Message to be signed (hex-encoded) */
  message_to_sign: string;
  /** Participant pubkeys selected for this signing round */
  selected_signers: string[];
  /** FROST participant identifiers corresponding to selected_signers */
  signer_ids: number[];
}

/**
 * ROUND1_COMMITMENT payload.
 * Sent by each participant in Round 1.
 * Matches test-zcash-ceremony-live.ts wire format.
 */
export interface Round1CommitmentPayload {
  /** Must match message_id from SIGNING_PACKAGE */
  message_id: string;
  /** Sender's pubkey */
  signer_id: string;
  /** Commitment object from WASM (identifier + commitment data) */
  commitment: WasmCommitment;
}

/**
 * COMMITMENTS_SET payload.
 * Sent by coordinator after collecting all Round 1 commitments.
 * Matches test-zcash-ceremony-live.ts wire format.
 */
export interface CommitmentsSetPayload {
  /** Must match message_id from SIGNING_PACKAGE */
  message_id: string;
  /** All collected commitments (array of WASM commitment objects) */
  commitments: WasmCommitment[];
  /** Signing package from backend.createSigningPackage() - required for Round 2 */
  signing_package: string;
  /** Randomizer from backend.createSigningPackage() - required for Orchard */
  randomizer: string;
  /** Group public key for verification */
  group_public_key: string;
}

/**
 * ROUND2_SIGNATURE_SHARE payload.
 * Sent by each participant in Round 2.
 * Matches test-zcash-ceremony-live.ts wire format.
 */
export interface Round2SignatureSharePayload {
  /** Must match message_id from SIGNING_PACKAGE */
  message_id: string;
  /** Sender's pubkey */
  signer_id: string;
  /** Signature share object from WASM (identifier + share) */
  share: WasmSignatureShare;
}

/**
 * SIGNATURE_RESULT payload.
 * Sent by coordinator after successfully aggregating signature.
 * Matches test-zcash-ceremony-live.ts wire format.
 */
export interface SignatureResultPayload {
  /** Must match message_id from SIGNING_PACKAGE */
  message_id: string;
  /** Backend used for signing */
  backendId: BackendId;
  /** Final aggregate signature (hex-encoded) */
  signature: string;
  /** Group public key used for verification */
  group_public_key: string;
  /** Randomizer used (included for Orchard, optional for Ed25519) */
  randomizer?: string;
  /** Whether signature verification passed */
  verified: boolean;
}

/**
 * ABORT payload.
 * Sent to abort a signing ceremony.
 */
export interface AbortPayload {
  /** Must match message_id from SIGNING_PACKAGE (if known) */
  message_id?: string;
  /** Reason for abort */
  reason: AbortReason;
  /** Human-readable message */
  message: string;
  /** Optional details */
  details?: Record<string, unknown>;
}

/**
 * Standardized abort reasons.
 */
export type AbortReason =
  | 'timeout'              // Round timed out
  | 'threshold_not_met'    // Not enough participants
  | 'invalid_commitment'   // Received invalid commitment
  | 'invalid_share'        // Received invalid signature share
  | 'aggregation_failed'   // Signature aggregation failed
  | 'user_cancelled'       // User cancelled the operation
  | 'session_expired'      // frostd session expired
  | 'backend_mismatch'     // backendId doesn't match loaded backend
  | 'message_id_mismatch'  // message_id doesn't match current signing
  | 'protocol_error';      // Generic protocol error

// =============================================================================
// Type-safe Message Unions
// =============================================================================

/**
 * Type-safe union of all message envelope types.
 */
export type FrostMessage =
  | MessageEnvelope<SigningPackagePayload>
  | MessageEnvelope<Round1CommitmentPayload>
  | MessageEnvelope<CommitmentsSetPayload>
  | MessageEnvelope<Round2SignatureSharePayload>
  | MessageEnvelope<SignatureResultPayload>
  | MessageEnvelope<AbortPayload>;

/**
 * Map from message type to payload type.
 */
export interface MessagePayloadMap {
  SIGNING_PACKAGE: SigningPackagePayload;
  ROUND1_COMMITMENT: Round1CommitmentPayload;
  COMMITMENTS_SET: CommitmentsSetPayload;
  ROUND2_SIGNATURE_SHARE: Round2SignatureSharePayload;
  SIGNATURE_RESULT: SignatureResultPayload;
  ABORT: AbortPayload;
}

/**
 * Type guard for specific message types.
 */
export function isMessageType<T extends MessageType>(
  msg: MessageEnvelope<unknown>,
  type: T
): msg is MessageEnvelope<MessagePayloadMap[T]> {
  return msg.t === type;
}

// =============================================================================
// Message Factory Functions
// =============================================================================

/**
 * Generate a unique message ID.
 */
export function generateMessageId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new message envelope.
 */
export function createMessage<T extends MessageType>(
  type: T,
  sessionId: string,
  fromPubkey: string,
  payload: MessagePayloadMap[T]
): MessageEnvelope<MessagePayloadMap[T]> {
  return {
    v: PROTOCOL_VERSION,
    sid: sessionId,
    id: generateMessageId(),
    t: type,
    from: fromPubkey,
    ts: Date.now(),
    payload,
  };
}

/**
 * Create a SIGNING_PACKAGE message.
 */
export function createSigningPackage(
  sessionId: string,
  fromPubkey: string,
  backendId: BackendId,
  messageId: string,
  messageToSign: string,
  selectedSigners: string[],
  signerIds: number[]
): MessageEnvelope<SigningPackagePayload> {
  return createMessage('SIGNING_PACKAGE', sessionId, fromPubkey, {
    backendId,
    message_id: messageId,
    message_to_sign: messageToSign,
    selected_signers: selectedSigners,
    signer_ids: signerIds,
  });
}

/**
 * Create a ROUND1_COMMITMENT message.
 */
export function createRound1Commitment(
  sessionId: string,
  fromPubkey: string,
  messageId: string,
  commitment: WasmCommitment
): MessageEnvelope<Round1CommitmentPayload> {
  return createMessage('ROUND1_COMMITMENT', sessionId, fromPubkey, {
    message_id: messageId,
    signer_id: fromPubkey,
    commitment,
  });
}

/**
 * Create a COMMITMENTS_SET message.
 */
export function createCommitmentsSet(
  sessionId: string,
  fromPubkey: string,
  messageId: string,
  commitments: WasmCommitment[],
  signingPackage: string,
  randomizer: string,
  groupPublicKey: string
): MessageEnvelope<CommitmentsSetPayload> {
  return createMessage('COMMITMENTS_SET', sessionId, fromPubkey, {
    message_id: messageId,
    commitments,
    signing_package: signingPackage,
    randomizer,
    group_public_key: groupPublicKey,
  });
}

/**
 * Create a ROUND2_SIGNATURE_SHARE message.
 */
export function createRound2SignatureShare(
  sessionId: string,
  fromPubkey: string,
  messageId: string,
  share: WasmSignatureShare
): MessageEnvelope<Round2SignatureSharePayload> {
  return createMessage('ROUND2_SIGNATURE_SHARE', sessionId, fromPubkey, {
    message_id: messageId,
    signer_id: fromPubkey,
    share,
  });
}

/**
 * Create a SIGNATURE_RESULT message.
 */
export function createSignatureResult(
  sessionId: string,
  fromPubkey: string,
  messageId: string,
  backendId: BackendId,
  signature: string,
  groupPublicKey: string,
  verified: boolean,
  randomizer?: string
): MessageEnvelope<SignatureResultPayload> {
  return createMessage('SIGNATURE_RESULT', sessionId, fromPubkey, {
    message_id: messageId,
    backendId,
    signature,
    group_public_key: groupPublicKey,
    randomizer,
    verified,
  });
}

/**
 * Create an ABORT message.
 */
export function createAbort(
  sessionId: string,
  fromPubkey: string,
  reason: AbortReason,
  message: string,
  messageId?: string,
  details?: Record<string, unknown>
): MessageEnvelope<AbortPayload> {
  return createMessage('ABORT', sessionId, fromPubkey, {
    message_id: messageId,
    reason,
    message,
    details,
  });
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize a message to JSON for transmission.
 */
export function serializeMessage(msg: FrostMessage): string {
  return JSON.stringify(msg);
}

/**
 * Deserialize a JSON string to a message.
 * Returns null if parsing fails.
 */
export function deserializeMessage(json: string): FrostMessage | null {
  try {
    return JSON.parse(json) as FrostMessage;
  } catch {
    return null;
  }
}

/**
 * Serialize a message to hex-encoded bytes for frostd /send endpoint.
 */
export function messageToHex(msg: FrostMessage): string {
  const json = serializeMessage(msg);
  const bytes = new TextEncoder().encode(json);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deserialize hex-encoded bytes from frostd /receive endpoint.
 */
export function hexToMessage(hex: string): FrostMessage | null {
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    const json = new TextDecoder().decode(bytes);
    return deserializeMessage(json);
  } catch {
    return null;
  }
}
