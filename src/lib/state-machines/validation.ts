/**
 * FROST Protocol Message Validation
 *
 * Production-ready validation for all protocol messages.
 * All messages are validated at ingress before processing.
 *
 * Validation rules:
 * 1. Envelope structure (v, sid, id, t, from, ts)
 * 2. Deduplication (sid + id combination)
 * 3. Monotonicity (reject Round2 before Round1)
 * 4. Freshness (reject if too old or from future)
 * 5. Session binding (reject if sid mismatch)
 * 6. Payload-specific validation
 */

import {
  type MessageEnvelope,
  type MessageType,
  type FrostMessage,
  type Round1CommitmentPayload,
  type Round2SignatureSharePayload,
  type SigningPackagePayload,
  type CommitmentsSetPayload,
  type SignatureResultPayload,
  type AbortPayload,
  PROTOCOL_VERSION,
  isMessageType,
} from '@/types/messages';

// =============================================================================
// Validation Configuration
// =============================================================================

/**
 * Maximum age of a message in milliseconds (10 minutes).
 * Messages older than this are rejected to prevent replay attacks.
 */
export const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

/**
 * Maximum future timestamp allowed in milliseconds (1 minute).
 * Allows for clock drift between participants.
 */
export const MAX_FUTURE_MS = 60 * 1000;

/**
 * Expected hex string length for a 32-byte value (64 chars).
 */
const HEX_32_BYTES = 64;

/**
 * Expected hex string length for a 64-byte signature (128 chars).
 */
const HEX_64_BYTES = 128;

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Result of message validation.
 */
export type ValidationResult =
  | { valid: true; message: FrostMessage }
  | { valid: false; error: ValidationError };

/**
 * Validation error with detailed reason.
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * All possible validation error codes.
 */
export type ValidationErrorCode =
  | 'INVALID_ENVELOPE'       // Envelope structure invalid
  | 'UNSUPPORTED_VERSION'    // Protocol version not supported
  | 'INVALID_SESSION_ID'     // Session ID format invalid
  | 'INVALID_MESSAGE_ID'     // Message ID format invalid
  | 'INVALID_MESSAGE_TYPE'   // Unknown message type
  | 'INVALID_PUBKEY'         // Public key format invalid
  | 'INVALID_TIMESTAMP'      // Timestamp format invalid
  | 'MESSAGE_TOO_OLD'        // Message timestamp too old
  | 'MESSAGE_FROM_FUTURE'    // Message timestamp in future
  | 'SESSION_MISMATCH'       // Message for different session
  | 'DUPLICATE_MESSAGE'      // Message already processed
  | 'INVALID_PAYLOAD'        // Payload validation failed
  | 'INVALID_COMMITMENT'     // Commitment data invalid
  | 'INVALID_SHARE'          // Signature share invalid
  | 'MONOTONICITY_VIOLATION' // Out of order message
  | 'NONCE_REUSE';           // Nonce reuse detected

// =============================================================================
// Deduplication Set
// =============================================================================

/**
 * Deduplication set for tracking processed messages.
 * Key = `${sid}:${id}` for efficient lookup.
 */
export class DeduplicationSet {
  private seen = new Set<string>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Make a key from session ID and message ID.
   */
  private makeKey(sid: string, id: string): string {
    return `${sid}:${id}`;
  }

  /**
   * Check if message was already seen.
   */
  hasSeen(sid: string, id: string): boolean {
    return this.seen.has(this.makeKey(sid, id));
  }

  /**
   * Mark message as seen.
   * Returns false if already seen (duplicate).
   */
  markSeen(sid: string, id: string): boolean {
    const key = this.makeKey(sid, id);
    if (this.seen.has(key)) {
      return false;
    }

    // Evict oldest entries if at capacity
    if (this.seen.size >= this.maxSize) {
      const firstKey = this.seen.values().next().value;
      if (firstKey) this.seen.delete(firstKey);
    }

    this.seen.add(key);
    return true;
  }

  /**
   * Clear all entries for a session.
   */
  clearSession(sid: string): void {
    for (const key of this.seen) {
      if (key.startsWith(`${sid}:`)) {
        this.seen.delete(key);
      }
    }
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.seen.clear();
  }

  /**
   * Get current size.
   */
  get size(): number {
    return this.seen.size;
  }
}

// =============================================================================
// Nonce Tracking (for nonce reuse protection)
// =============================================================================

/**
 * Tracks nonces used in signing rounds to prevent reuse.
 * Key = participantId, Value = Set of message IDs where nonces were used.
 */
export class NonceTracker {
  private usedNonces = new Map<number, Set<string>>();

  /**
   * Record nonce usage for a participant in a specific message.
   * Returns false if nonce was already used (reuse detected).
   */
  recordNonceUsage(participantId: number, messageId: string): boolean {
    let messageIds = this.usedNonces.get(participantId);
    if (!messageIds) {
      messageIds = new Set();
      this.usedNonces.set(participantId, messageIds);
    }

    if (messageIds.has(messageId)) {
      return false; // Already used
    }

    messageIds.add(messageId);
    return true;
  }

  /**
   * Check if participant has already used nonces.
   */
  hasUsedNonces(participantId: number): boolean {
    return this.usedNonces.has(participantId);
  }

  /**
   * Clear nonce tracking for a new signing round.
   */
  clear(): void {
    this.usedNonces.clear();
  }

  /**
   * Clear nonces for a specific participant.
   */
  clearParticipant(participantId: number): void {
    this.usedNonces.delete(participantId);
  }
}

// =============================================================================
// Monotonicity Checker
// =============================================================================

/**
 * Protocol phases in order.
 */
export type ProtocolPhase =
  | 'idle'
  | 'round1'
  | 'commitments_sent'
  | 'round2'
  | 'complete';

/**
 * Map message types to required phases.
 */
const MESSAGE_PHASE_REQUIREMENTS: Record<MessageType, ProtocolPhase[]> = {
  SIGNING_PACKAGE: ['idle'],
  ROUND1_COMMITMENT: ['round1'],
  COMMITMENTS_SET: ['round1'],
  ROUND2_SIGNATURE_SHARE: ['round2'],
  SIGNATURE_RESULT: ['round2'],
  ABORT: ['idle', 'round1', 'commitments_sent', 'round2'], // Can abort anytime
};

/**
 * Check if a message is valid for the current phase.
 */
export function isValidForPhase(
  messageType: MessageType,
  currentPhase: ProtocolPhase
): boolean {
  const allowedPhases = MESSAGE_PHASE_REQUIREMENTS[messageType];
  return allowedPhases.includes(currentPhase);
}

// =============================================================================
// Envelope Validation
// =============================================================================

/**
 * Validate message envelope structure.
 */
export function validateEnvelope(
  data: unknown
): ValidationResult {
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      error: {
        code: 'INVALID_ENVELOPE',
        message: 'Message must be an object',
      },
    };
  }

  const msg = data as Record<string, unknown>;

  // Version check
  if (msg.v !== PROTOCOL_VERSION) {
    return {
      valid: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: `Unsupported protocol version: ${msg.v}, expected: ${PROTOCOL_VERSION}`,
        details: { received: msg.v, expected: PROTOCOL_VERSION },
      },
    };
  }

  // Session ID
  if (typeof msg.sid !== 'string' || !isValidUUID(msg.sid)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_SESSION_ID',
        message: 'Session ID must be a valid UUID',
      },
    };
  }

  // Message ID
  if (typeof msg.id !== 'string' || !isValidUUID(msg.id)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_MESSAGE_ID',
        message: 'Message ID must be a valid UUID',
      },
    };
  }

  // Message type
  if (typeof msg.t !== 'string' || !isValidMessageType(msg.t)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_MESSAGE_TYPE',
        message: `Unknown message type: ${msg.t}`,
      },
    };
  }

  // Sender pubkey
  if (typeof msg.from !== 'string' || !isValidHexPubkey(msg.from)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_PUBKEY',
        message: 'Sender public key must be 64 hex characters',
      },
    };
  }

  // Timestamp
  if (typeof msg.ts !== 'number' || !Number.isFinite(msg.ts)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TIMESTAMP',
        message: 'Timestamp must be a finite number',
      },
    };
  }

  // Payload must exist
  if (msg.payload === undefined) {
    return {
      valid: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Payload is required',
      },
    };
  }

  return { valid: true, message: msg as unknown as FrostMessage };
}

/**
 * Validate message freshness (not too old, not from future).
 */
export function validateFreshness(ts: number, now = Date.now()): ValidationResult | null {
  const age = now - ts;

  if (age > MAX_MESSAGE_AGE_MS) {
    return {
      valid: false,
      error: {
        code: 'MESSAGE_TOO_OLD',
        message: `Message is ${Math.round(age / 1000)}s old, max allowed: ${MAX_MESSAGE_AGE_MS / 1000}s`,
        details: { age, maxAge: MAX_MESSAGE_AGE_MS },
      },
    };
  }

  if (age < -MAX_FUTURE_MS) {
    return {
      valid: false,
      error: {
        code: 'MESSAGE_FROM_FUTURE',
        message: `Message timestamp is ${Math.round(-age / 1000)}s in the future`,
        details: { futureBy: -age, maxAllowed: MAX_FUTURE_MS },
      },
    };
  }

  return null; // Valid
}

/**
 * Validate session binding.
 */
export function validateSessionBinding(
  messageSid: string,
  expectedSid: string
): ValidationResult | null {
  if (messageSid !== expectedSid) {
    return {
      valid: false,
      error: {
        code: 'SESSION_MISMATCH',
        message: 'Message is for a different session',
        details: { messageSid, expectedSid },
      },
    };
  }
  return null; // Valid
}

// =============================================================================
// Payload-Specific Validation
// =============================================================================

/**
 * Validate SIGNING_PACKAGE payload.
 */
export function validateSigningPackage(
  payload: unknown
): ValidationError | null {
  const p = payload as SigningPackagePayload;

  if (typeof p.message !== 'string' || !isValidHex(p.message)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Signing package message must be valid hex',
    };
  }

  if (!Array.isArray(p.signerIds) || p.signerIds.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Signing package must have at least one signer',
    };
  }

  if (!p.signerIds.every((id) => Number.isInteger(id) && id > 0)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Signer IDs must be positive integers',
    };
  }

  if (typeof p.coordinatorPubkey !== 'string' || !isValidHexPubkey(p.coordinatorPubkey)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Coordinator public key must be 64 hex characters',
    };
  }

  return null;
}

/**
 * Validate ROUND1_COMMITMENT payload.
 */
export function validateRound1Commitment(
  payload: unknown
): ValidationError | null {
  const p = payload as Round1CommitmentPayload;

  if (!Number.isInteger(p.participantId) || p.participantId <= 0) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Participant ID must be a positive integer',
    };
  }

  if (typeof p.hiding !== 'string' || p.hiding.length !== HEX_32_BYTES) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Hiding commitment must be 64 hex characters',
    };
  }

  if (typeof p.binding !== 'string' || p.binding.length !== HEX_32_BYTES) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Binding commitment must be 64 hex characters',
    };
  }

  if (!isValidHex(p.hiding) || !isValidHex(p.binding)) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Commitments must be valid hex strings',
    };
  }

  return null;
}

/**
 * Validate COMMITMENTS_SET payload.
 */
export function validateCommitmentsSet(
  payload: unknown
): ValidationError | null {
  const p = payload as CommitmentsSetPayload;

  if (!Array.isArray(p.commitments) || p.commitments.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Commitments set must contain at least one commitment',
    };
  }

  // Validate each commitment
  for (const commitment of p.commitments) {
    const error = validateRound1Commitment(commitment);
    if (error) return error;
  }

  // Check for duplicate participant IDs
  const participantIds = new Set<number>();
  for (const c of p.commitments) {
    if (participantIds.has(c.participantId)) {
      return {
        code: 'INVALID_PAYLOAD',
        message: `Duplicate commitment for participant ${c.participantId}`,
      };
    }
    participantIds.add(c.participantId);
  }

  if (typeof p.message !== 'string' || !isValidHex(p.message)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Message must be valid hex',
    };
  }

  return null;
}

/**
 * Validate ROUND2_SIGNATURE_SHARE payload.
 */
export function validateRound2SignatureShare(
  payload: unknown
): ValidationError | null {
  const p = payload as Round2SignatureSharePayload;

  if (!Number.isInteger(p.participantId) || p.participantId <= 0) {
    return {
      code: 'INVALID_SHARE',
      message: 'Participant ID must be a positive integer',
    };
  }

  if (typeof p.share !== 'string' || p.share.length !== HEX_32_BYTES) {
    return {
      code: 'INVALID_SHARE',
      message: 'Signature share must be 64 hex characters',
    };
  }

  if (!isValidHex(p.share)) {
    return {
      code: 'INVALID_SHARE',
      message: 'Signature share must be valid hex',
    };
  }

  return null;
}

/**
 * Validate SIGNATURE_RESULT payload.
 */
export function validateSignatureResult(
  payload: unknown
): ValidationError | null {
  const p = payload as SignatureResultPayload;

  if (typeof p.signature !== 'string' || p.signature.length !== HEX_64_BYTES) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Signature must be 128 hex characters',
    };
  }

  if (!isValidHex(p.signature)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Signature must be valid hex',
    };
  }

  if (typeof p.message !== 'string' || !isValidHex(p.message)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Message must be valid hex',
    };
  }

  if (typeof p.verified !== 'boolean') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Verified must be a boolean',
    };
  }

  return null;
}

/**
 * Validate ABORT payload.
 */
export function validateAbort(payload: unknown): ValidationError | null {
  const p = payload as AbortPayload;

  const validReasons = [
    'timeout',
    'threshold_not_met',
    'invalid_commitment',
    'invalid_share',
    'aggregation_failed',
    'user_cancelled',
    'session_expired',
    'protocol_error',
  ];

  if (typeof p.reason !== 'string' || !validReasons.includes(p.reason)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: `Invalid abort reason: ${p.reason}`,
    };
  }

  if (typeof p.message !== 'string') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'Abort message must be a string',
    };
  }

  return null;
}

/**
 * Validate payload based on message type.
 */
export function validatePayload(
  messageType: MessageType,
  payload: unknown
): ValidationError | null {
  switch (messageType) {
    case 'SIGNING_PACKAGE':
      return validateSigningPackage(payload);
    case 'ROUND1_COMMITMENT':
      return validateRound1Commitment(payload);
    case 'COMMITMENTS_SET':
      return validateCommitmentsSet(payload);
    case 'ROUND2_SIGNATURE_SHARE':
      return validateRound2SignatureShare(payload);
    case 'SIGNATURE_RESULT':
      return validateSignatureResult(payload);
    case 'ABORT':
      return validateAbort(payload);
    default:
      return {
        code: 'INVALID_MESSAGE_TYPE',
        message: `Unknown message type: ${messageType}`,
      };
  }
}

// =============================================================================
// Full Message Validation
// =============================================================================

/**
 * Fully validate a message including all checks.
 */
export function validateMessage(
  data: unknown,
  options: {
    expectedSessionId?: string;
    currentPhase?: ProtocolPhase;
    dedupeSet?: DeduplicationSet;
    checkFreshness?: boolean;
  } = {}
): ValidationResult {
  const {
    expectedSessionId,
    currentPhase,
    dedupeSet,
    checkFreshness = true,
  } = options;

  // Step 1: Validate envelope structure
  const envelopeResult = validateEnvelope(data);
  if (!envelopeResult.valid) {
    return envelopeResult;
  }

  const msg = envelopeResult.message;

  // Step 2: Check freshness
  if (checkFreshness) {
    const freshnessError = validateFreshness(msg.ts);
    if (freshnessError) {
      return freshnessError;
    }
  }

  // Step 3: Check session binding
  if (expectedSessionId) {
    const bindingError = validateSessionBinding(msg.sid, expectedSessionId);
    if (bindingError) {
      return bindingError;
    }
  }

  // Step 4: Check deduplication
  if (dedupeSet) {
    if (!dedupeSet.markSeen(msg.sid, msg.id)) {
      return {
        valid: false,
        error: {
          code: 'DUPLICATE_MESSAGE',
          message: 'Message already processed',
          details: { messageId: msg.id },
        },
      };
    }
  }

  // Step 5: Check monotonicity
  if (currentPhase) {
    if (!isValidForPhase(msg.t, currentPhase)) {
      return {
        valid: false,
        error: {
          code: 'MONOTONICITY_VIOLATION',
          message: `Cannot receive ${msg.t} message in ${currentPhase} phase`,
          details: { messageType: msg.t, currentPhase },
        },
      };
    }
  }

  // Step 6: Validate payload
  const payloadError = validatePayload(msg.t, msg.payload);
  if (payloadError) {
    return { valid: false, error: payloadError };
  }

  return { valid: true, message: msg };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if string is valid UUID format.
 */
function isValidUUID(s: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(s);
}

/**
 * Check if string is valid hex.
 */
function isValidHex(s: string): boolean {
  return /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0;
}

/**
 * Check if string is valid 32-byte hex pubkey.
 */
function isValidHexPubkey(s: string): boolean {
  return s.length === HEX_32_BYTES && isValidHex(s);
}

/**
 * Check if string is valid message type.
 */
function isValidMessageType(s: string): s is MessageType {
  const validTypes: MessageType[] = [
    'SIGNING_PACKAGE',
    'ROUND1_COMMITMENT',
    'COMMITMENTS_SET',
    'ROUND2_SIGNATURE_SHARE',
    'SIGNATURE_RESULT',
    'ABORT',
  ];
  return validTypes.includes(s as MessageType);
}
