/**
 * FROST Protocol Message Types
 *
 * Production-ready message envelope and payload types for FROST signing ceremonies.
 * All state machines derive state by replaying this message log.
 *
 * Design principles:
 * - Single source of truth = message log
 * - All messages use standard envelope format
 * - Strict validation at ingress
 * - No non-spec concepts (inviteCode, etc.)
 */

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
// Message Payload Types
// =============================================================================

/**
 * SIGNING_PACKAGE payload.
 * Sent by coordinator to start a signing ceremony.
 */
export interface SigningPackagePayload {
  /** Message to be signed (hex-encoded) */
  message: string;
  /** Participant identifiers selected for this signing round */
  signerIds: number[];
  /** Coordinator's pubkey for verification */
  coordinatorPubkey: string;
}

/**
 * ROUND1_COMMITMENT payload.
 * Sent by each participant in Round 1.
 */
export interface Round1CommitmentPayload {
  /** Participant's identifier in the group */
  participantId: number;
  /** Hiding commitment D_i (hex-encoded, 64 chars) */
  hiding: string;
  /** Binding commitment E_i (hex-encoded, 64 chars) */
  binding: string;
}

/**
 * COMMITMENTS_SET payload.
 * Sent by coordinator after collecting all Round 1 commitments.
 */
export interface CommitmentsSetPayload {
  /** All collected commitments from participating signers */
  commitments: Round1CommitmentPayload[];
  /** The message being signed (echoed for verification) */
  message: string;
}

/**
 * ROUND2_SIGNATURE_SHARE payload.
 * Sent by each participant in Round 2.
 */
export interface Round2SignatureSharePayload {
  /** Participant's identifier in the group */
  participantId: number;
  /** Signature share z_i (hex-encoded, 64 chars) */
  share: string;
}

/**
 * SIGNATURE_RESULT payload.
 * Sent by coordinator after successfully aggregating signature.
 */
export interface SignatureResultPayload {
  /** Final aggregate signature (hex-encoded, 128 chars for Schnorr) */
  signature: string;
  /** The message that was signed */
  message: string;
  /** Whether signature verification passed */
  verified: boolean;
}

/**
 * ABORT payload.
 * Sent to abort a signing ceremony.
 */
export interface AbortPayload {
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
  | 'protocol_error';      // Generic protocol error

// =============================================================================
// Type-safe Message Constructors
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
  message: string,
  signerIds: number[]
): MessageEnvelope<SigningPackagePayload> {
  return createMessage('SIGNING_PACKAGE', sessionId, fromPubkey, {
    message,
    signerIds,
    coordinatorPubkey: fromPubkey,
  });
}

/**
 * Create a ROUND1_COMMITMENT message.
 */
export function createRound1Commitment(
  sessionId: string,
  fromPubkey: string,
  participantId: number,
  hiding: string,
  binding: string
): MessageEnvelope<Round1CommitmentPayload> {
  return createMessage('ROUND1_COMMITMENT', sessionId, fromPubkey, {
    participantId,
    hiding,
    binding,
  });
}

/**
 * Create a COMMITMENTS_SET message.
 */
export function createCommitmentsSet(
  sessionId: string,
  fromPubkey: string,
  commitments: Round1CommitmentPayload[],
  message: string
): MessageEnvelope<CommitmentsSetPayload> {
  return createMessage('COMMITMENTS_SET', sessionId, fromPubkey, {
    commitments,
    message,
  });
}

/**
 * Create a ROUND2_SIGNATURE_SHARE message.
 */
export function createRound2SignatureShare(
  sessionId: string,
  fromPubkey: string,
  participantId: number,
  share: string
): MessageEnvelope<Round2SignatureSharePayload> {
  return createMessage('ROUND2_SIGNATURE_SHARE', sessionId, fromPubkey, {
    participantId,
    share,
  });
}

/**
 * Create a SIGNATURE_RESULT message.
 */
export function createSignatureResult(
  sessionId: string,
  fromPubkey: string,
  signature: string,
  message: string,
  verified: boolean
): MessageEnvelope<SignatureResultPayload> {
  return createMessage('SIGNATURE_RESULT', sessionId, fromPubkey, {
    signature,
    message,
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
  details?: Record<string, unknown>
): MessageEnvelope<AbortPayload> {
  return createMessage('ABORT', sessionId, fromPubkey, {
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
