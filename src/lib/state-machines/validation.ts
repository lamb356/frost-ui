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
 * 6. message_id linkage (all messages in signing attempt must match)
 * 7. Backend-specific validation (randomizer required for Orchard)
 * 8. Payload-specific validation
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
  type WasmCommitment,
  type WasmSignatureShare,
  type BackendId,
  PROTOCOL_VERSION,
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
  | 'MESSAGE_ID_MISMATCH'    // message_id doesn't match current signing
  | 'DUPLICATE_MESSAGE'      // Message already processed
  | 'INVALID_PAYLOAD'        // Payload validation failed
  | 'INVALID_COMMITMENT'     // Commitment data invalid
  | 'INVALID_SHARE'          // Signature share invalid
  | 'INVALID_BACKEND'        // Invalid or mismatched backend
  | 'MISSING_RANDOMIZER'     // Randomizer required but missing
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
  ROUND2_SIGNATURE_SHARE: ['commitments_sent', 'round2'], // Accept during broadcast window
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

/**
 * Validate message_id linkage.
 */
export function validateMessageIdLinkage(
  payloadMessageId: string,
  expectedMessageId: string
): ValidationError | null {
  if (payloadMessageId !== expectedMessageId) {
    return {
      code: 'MESSAGE_ID_MISMATCH',
      message: 'message_id does not match current signing attempt',
      details: { received: payloadMessageId, expected: expectedMessageId },
    };
  }
  return null;
}

// =============================================================================
// Payload-Specific Validation
// =============================================================================

/**
 * Valid backend IDs.
 */
const VALID_BACKENDS: BackendId[] = ['ed25519', 'orchard-redpallas'];

/**
 * Validate backend ID.
 */
function isValidBackendId(id: unknown): id is BackendId {
  return typeof id === 'string' && VALID_BACKENDS.includes(id as BackendId);
}

/**
 * Validate a WASM commitment object.
 */
function validateWasmCommitment(commitment: unknown): ValidationError | null {
  if (!commitment || typeof commitment !== 'object') {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Commitment must be an object',
    };
  }

  const c = commitment as WasmCommitment;

  if (!Number.isInteger(c.identifier) || c.identifier <= 0) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Commitment identifier must be a positive integer',
    };
  }

  if (typeof c.commitment !== 'string' || c.commitment.length === 0) {
    return {
      code: 'INVALID_COMMITMENT',
      message: 'Commitment data must be a non-empty string',
    };
  }

  return null;
}

/**
 * Validate a WASM signature share object.
 */
function validateWasmSignatureShare(share: unknown): ValidationError | null {
  if (!share || typeof share !== 'object') {
    return {
      code: 'INVALID_SHARE',
      message: 'Signature share must be an object',
    };
  }

  const s = share as WasmSignatureShare;

  if (!Number.isInteger(s.identifier) || s.identifier <= 0) {
    return {
      code: 'INVALID_SHARE',
      message: 'Share identifier must be a positive integer',
    };
  }

  if (typeof s.share !== 'string' || s.share.length === 0) {
    return {
      code: 'INVALID_SHARE',
      message: 'Share data must be a non-empty string',
    };
  }

  return null;
}

/**
 * Validate SIGNING_PACKAGE payload.
 */
export function validateSigningPackage(
  payload: unknown
): ValidationError | null {
  const p = payload as SigningPackagePayload;

  // backendId
  if (!isValidBackendId(p.backendId)) {
    return {
      code: 'INVALID_BACKEND',
      message: `Invalid backend ID: ${p.backendId}`,
    };
  }

  // message_id
  if (typeof p.message_id !== 'string' || !isValidUUID(p.message_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a valid UUID',
    };
  }

  // message_to_sign
  if (typeof p.message_to_sign !== 'string' || !isValidHex(p.message_to_sign)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_to_sign must be valid hex',
    };
  }

  // selected_signers
  if (!Array.isArray(p.selected_signers) || p.selected_signers.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'selected_signers must be a non-empty array',
    };
  }

  if (!p.selected_signers.every((s) => typeof s === 'string' && isValidHexPubkey(s))) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'All selected_signers must be valid 64-char hex pubkeys',
    };
  }

  // signer_ids
  if (!Array.isArray(p.signer_ids) || p.signer_ids.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'signer_ids must be a non-empty array',
    };
  }

  if (!p.signer_ids.every((id) => Number.isInteger(id) && id > 0)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'All signer_ids must be positive integers',
    };
  }

  // Verify arrays have same length
  if (p.selected_signers.length !== p.signer_ids.length) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'selected_signers and signer_ids must have same length',
    };
  }

  return null;
}

/**
 * Validate ROUND1_COMMITMENT payload.
 */
export function validateRound1Commitment(
  payload: unknown,
  expectedMessageId?: string
): ValidationError | null {
  const p = payload as Round1CommitmentPayload;

  // message_id
  if (typeof p.message_id !== 'string' || !isValidUUID(p.message_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a valid UUID',
    };
  }

  // Check message_id linkage if expected
  if (expectedMessageId) {
    const linkageError = validateMessageIdLinkage(p.message_id, expectedMessageId);
    if (linkageError) return linkageError;
  }

  // signer_id
  if (typeof p.signer_id !== 'string' || !isValidHexPubkey(p.signer_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'signer_id must be a valid 64-char hex pubkey',
    };
  }

  // commitment (WASM object)
  const commitmentError = validateWasmCommitment(p.commitment);
  if (commitmentError) return commitmentError;

  return null;
}

/**
 * Validate COMMITMENTS_SET payload.
 */
export function validateCommitmentsSet(
  payload: unknown,
  expectedMessageId?: string,
  expectedBackend?: BackendId
): ValidationError | null {
  const p = payload as CommitmentsSetPayload;

  // message_id
  if (typeof p.message_id !== 'string' || !isValidUUID(p.message_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a valid UUID',
    };
  }

  // Check message_id linkage if expected
  if (expectedMessageId) {
    const linkageError = validateMessageIdLinkage(p.message_id, expectedMessageId);
    if (linkageError) return linkageError;
  }

  // commitments array
  if (!Array.isArray(p.commitments) || p.commitments.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'commitments must be a non-empty array',
    };
  }

  // Validate each commitment
  for (const commitment of p.commitments) {
    const error = validateWasmCommitment(commitment);
    if (error) return error;
  }

  // Check for duplicate identifiers
  const identifiers = new Set<number>();
  for (const c of p.commitments) {
    if (identifiers.has(c.identifier)) {
      return {
        code: 'INVALID_PAYLOAD',
        message: `Duplicate commitment for identifier ${c.identifier}`,
      };
    }
    identifiers.add(c.identifier);
  }

  // signing_package
  if (typeof p.signing_package !== 'string' || p.signing_package.length === 0) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'signing_package must be a non-empty string',
    };
  }

  // randomizer (always required - even Ed25519 includes empty string)
  if (typeof p.randomizer !== 'string') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'randomizer must be a string',
    };
  }

  // For Orchard, randomizer must not be empty
  if (expectedBackend === 'orchard-redpallas' && p.randomizer.length === 0) {
    return {
      code: 'MISSING_RANDOMIZER',
      message: 'randomizer is required for orchard-redpallas backend',
    };
  }

  // group_public_key
  if (typeof p.group_public_key !== 'string' || !isValidHex(p.group_public_key)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'group_public_key must be valid hex',
    };
  }

  return null;
}

/**
 * Validate ROUND2_SIGNATURE_SHARE payload.
 */
export function validateRound2SignatureShare(
  payload: unknown,
  expectedMessageId?: string
): ValidationError | null {
  const p = payload as Round2SignatureSharePayload;

  // message_id
  if (typeof p.message_id !== 'string' || !isValidUUID(p.message_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a valid UUID',
    };
  }

  // Check message_id linkage if expected
  if (expectedMessageId) {
    const linkageError = validateMessageIdLinkage(p.message_id, expectedMessageId);
    if (linkageError) return linkageError;
  }

  // signer_id
  if (typeof p.signer_id !== 'string' || !isValidHexPubkey(p.signer_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'signer_id must be a valid 64-char hex pubkey',
    };
  }

  // share (WASM object)
  const shareError = validateWasmSignatureShare(p.share);
  if (shareError) return shareError;

  return null;
}

/**
 * Validate SIGNATURE_RESULT payload.
 */
export function validateSignatureResult(
  payload: unknown,
  expectedMessageId?: string
): ValidationError | null {
  const p = payload as SignatureResultPayload;

  // message_id
  if (typeof p.message_id !== 'string' || !isValidUUID(p.message_id)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a valid UUID',
    };
  }

  // Check message_id linkage if expected
  if (expectedMessageId) {
    const linkageError = validateMessageIdLinkage(p.message_id, expectedMessageId);
    if (linkageError) return linkageError;
  }

  // backendId
  if (!isValidBackendId(p.backendId)) {
    return {
      code: 'INVALID_BACKEND',
      message: `Invalid backend ID: ${p.backendId}`,
    };
  }

  // signature - can be variable length depending on curve
  if (typeof p.signature !== 'string' || !isValidHex(p.signature)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'signature must be valid hex',
    };
  }

  // group_public_key
  if (typeof p.group_public_key !== 'string' || !isValidHex(p.group_public_key)) {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'group_public_key must be valid hex',
    };
  }

  // randomizer (optional for Ed25519, present for Orchard)
  if (p.randomizer !== undefined && typeof p.randomizer !== 'string') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'randomizer must be a string if present',
    };
  }

  // For Orchard, randomizer should be present
  if (p.backendId === 'orchard-redpallas' && (!p.randomizer || p.randomizer.length === 0)) {
    return {
      code: 'MISSING_RANDOMIZER',
      message: 'randomizer is required for orchard-redpallas results',
    };
  }

  // verified
  if (typeof p.verified !== 'boolean') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'verified must be a boolean',
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
    'backend_mismatch',
    'message_id_mismatch',
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

  // message_id is optional in abort
  if (p.message_id !== undefined && typeof p.message_id !== 'string') {
    return {
      code: 'INVALID_PAYLOAD',
      message: 'message_id must be a string if present',
    };
  }

  return null;
}

/**
 * Validate payload based on message type.
 */
export function validatePayload(
  messageType: MessageType,
  payload: unknown,
  options: {
    expectedMessageId?: string;
    expectedBackend?: BackendId;
  } = {}
): ValidationError | null {
  const { expectedMessageId, expectedBackend } = options;

  switch (messageType) {
    case 'SIGNING_PACKAGE':
      return validateSigningPackage(payload);
    case 'ROUND1_COMMITMENT':
      return validateRound1Commitment(payload, expectedMessageId);
    case 'COMMITMENTS_SET':
      return validateCommitmentsSet(payload, expectedMessageId, expectedBackend);
    case 'ROUND2_SIGNATURE_SHARE':
      return validateRound2SignatureShare(payload, expectedMessageId);
    case 'SIGNATURE_RESULT':
      return validateSignatureResult(payload, expectedMessageId);
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
    expectedMessageId?: string;
    expectedBackend?: BackendId;
    currentPhase?: ProtocolPhase;
    dedupeSet?: DeduplicationSet;
    checkFreshness?: boolean;
  } = {}
): ValidationResult {
  const {
    expectedSessionId,
    expectedMessageId,
    expectedBackend,
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

  // Step 4: Check monotonicity (phase check BEFORE dedupe to avoid burning messages)
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

  // Step 5: Check deduplication (after phase check so rejected messages can be retried)
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

  // Step 6: Validate payload (including message_id linkage and backend checks)
  const payloadError = validatePayload(msg.t, msg.payload, {
    expectedMessageId,
    expectedBackend,
  });
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
