/**
 * FROST (Flexible Round-Optimized Schnorr Threshold) Types for Zcash
 *
 * These types define the data structures used in FROST threshold signing
 * ceremonies for Zcash transactions.
 */

// =============================================================================
// Core FROST Types
// =============================================================================

/** Participant identifier in the signing group (1-indexed) */
export type ParticipantId = number;

/** Hex-encoded public key */
export type PublicKey = string;

/** Hex-encoded secret share (never transmitted, only stored locally) */
export type SecretShare = string;

/** Hex-encoded commitment (binding or hiding) */
export type Commitment = string;

/** Hex-encoded signature share */
export type SignatureShare = string;

/** Hex-encoded aggregate signature */
export type AggregateSignature = string;

/** Hex-encoded nonce */
export type Nonce = string;

/** Session identifier */
export type SessionId = string;

/** Message identifier for encrypted communications */
export type MessageId = string;

// =============================================================================
// Key Generation Types
// =============================================================================

/**
 * FROST key package containing a participant's secret share and group information.
 * Generated during distributed key generation (DKG) or trusted dealer setup.
 */
export interface FrostKeyPackage {
  /** This participant's identifier */
  participantId: ParticipantId;
  /** This participant's secret share (keep private!) */
  secretShare: SecretShare;
  /** The group's public key (shared by all participants) */
  groupPublicKey: PublicKey;
  /** Public key shares for all participants */
  publicKeyShares: Record<ParticipantId, PublicKey>;
  /** Threshold required for signing (t of n) */
  threshold: number;
  /** Total number of participants */
  totalParticipants: number;
}

/**
 * Public key package that can be shared with others.
 * Contains no secret information.
 */
export interface FrostPublicKeyPackage {
  /** The group's public key */
  groupPublicKey: PublicKey;
  /** Public key shares for verification */
  publicKeyShares: Record<ParticipantId, PublicKey>;
  /** Threshold required for signing */
  threshold: number;
  /** Total number of participants */
  totalParticipants: number;
}

// =============================================================================
// Signing Round Types
// =============================================================================

/**
 * Commitment generated in Round 1 of FROST signing.
 * Contains hiding and binding commitments for the participant's nonce.
 */
export interface SigningCommitment {
  /** Participant who generated this commitment */
  participantId: ParticipantId;
  /** Hiding commitment (D_i) */
  hiding: Commitment;
  /** Binding commitment (E_i) */
  binding: Commitment;
}

/**
 * Nonce pair generated during Round 1.
 * The nonces must be kept secret; only commitments are shared.
 */
export interface SigningNonces {
  /** Hiding nonce (d_i) - KEEP SECRET */
  hiding: Nonce;
  /** Binding nonce (e_i) - KEEP SECRET */
  binding: Nonce;
}

/**
 * Signature share generated in Round 2 of FROST signing.
 */
export interface FrostSignatureShare {
  /** Participant who generated this share */
  participantId: ParticipantId;
  /** The signature share value */
  share: SignatureShare;
}

/**
 * Complete signing package containing all information needed
 * for a participant to generate their signature share.
 */
export interface SigningPackage {
  /** The message being signed (hex-encoded) */
  message: string;
  /** All commitments from participating signers */
  commitments: SigningCommitment[];
  /** Identifiers of participants who are signing */
  signerIds: ParticipantId[];
}

// =============================================================================
// Session Types
// =============================================================================

/** Current state of a signing session */
export type SessionState =
  | 'created'           // Session created, waiting for participants
  | 'collecting_commitments'  // Round 1: collecting signing commitments
  | 'signing'           // Round 2: collecting signature shares
  | 'aggregating'       // Aggregating signature shares
  | 'completed'         // Signing completed successfully
  | 'failed'            // Signing failed
  | 'closed';           // Session closed

/** Role of a participant in a session */
export type SessionRole = 'coordinator' | 'participant';

/**
 * Information about a signing session.
 */
export interface SessionInfo {
  /** Unique session identifier */
  sessionId: SessionId;
  /** Human-readable session name/description */
  name: string;
  /** Session creator's public key */
  coordinatorPubkey: PublicKey;
  /** Current state of the session */
  state: SessionState;
  /** Required threshold for this session */
  threshold: number;
  /** Maximum participants for this session */
  maxParticipants: number;
  /** Currently joined participants */
  participants: ParticipantInfo[];
  /** Message to be signed (hex-encoded, available after state advances) */
  message?: string;
  /** Unix timestamp when session was created */
  createdAt: number;
  /** Unix timestamp when session expires */
  expiresAt: number;
}

/**
 * Information about a participant in a session.
 */
export interface ParticipantInfo {
  /** Participant's public key */
  pubkey: PublicKey;
  /** Participant's identifier for this session */
  participantId: ParticipantId;
  /** Whether participant has submitted their commitment */
  hasCommitment: boolean;
  /** Whether participant has submitted their signature share */
  hasSignatureShare: boolean;
  /** Unix timestamp when participant joined */
  joinedAt: number;
}

// =============================================================================
// Encrypted Message Types
// =============================================================================

/** Type of message sent between participants */
export type MessageType =
  | 'commitment'        // Round 1 commitment
  | 'signature_share'   // Round 2 signature share
  | 'key_share'         // DKG key share
  | 'ack'               // Acknowledgment
  | 'error';            // Error notification

/**
 * Encrypted message envelope for secure communication.
 */
export interface EncryptedMessage {
  /** Unique message identifier */
  id: MessageId;
  /** Sender's public key */
  senderPubkey: PublicKey;
  /** Recipient's public key (or 'broadcast' for all) */
  recipientPubkey: PublicKey | 'broadcast';
  /** Type of message content */
  messageType: MessageType;
  /** Encrypted payload (base64) */
  ciphertext: string;
  /** Nonce used for encryption (base64) */
  nonce: string;
  /** Unix timestamp */
  timestamp: number;
}

/**
 * Decrypted message content.
 */
export interface DecryptedMessage<T = unknown> {
  /** Original encrypted message metadata */
  envelope: Omit<EncryptedMessage, 'ciphertext' | 'nonce'>;
  /** Decrypted and parsed payload */
  payload: T;
}

// =============================================================================
// Zcash Transaction Types
// =============================================================================

/**
 * Zcash transaction input to be signed.
 */
export interface ZcashTxInput {
  /** Previous transaction hash */
  txid: string;
  /** Output index in previous transaction */
  vout: number;
  /** Amount in zatoshis */
  amount: bigint;
  /** Script pubkey */
  scriptPubKey: string;
}

/**
 * Zcash transaction output.
 */
export interface ZcashTxOutput {
  /** Recipient address */
  address: string;
  /** Amount in zatoshis */
  amount: bigint;
  /** Optional memo field (for shielded outputs) */
  memo?: string;
}

/**
 * Unsigned Zcash transaction for FROST signing.
 */
export interface UnsignedZcashTransaction {
  /** Transaction version */
  version: number;
  /** Consensus branch ID */
  consensusBranchId: string;
  /** Transaction inputs */
  inputs: ZcashTxInput[];
  /** Transaction outputs */
  outputs: ZcashTxOutput[];
  /** Lock time */
  lockTime: number;
  /** Expiry height */
  expiryHeight: number;
  /** Raw transaction bytes for signing (hex) */
  rawTx: string;
  /** Sighash for each input (hex) */
  sighashes: string[];
}

/**
 * Signed Zcash transaction.
 */
export interface SignedZcashTransaction {
  /** The unsigned transaction that was signed */
  unsignedTx: UnsignedZcashTransaction;
  /** FROST aggregate signatures for each input */
  signatures: AggregateSignature[];
  /** Complete signed transaction (hex) */
  signedTxHex: string;
  /** Transaction ID */
  txid: string;
}

// =============================================================================
// Error Types
// =============================================================================

/** Error codes from frostd */
export type FrostErrorCode =
  | 'INVALID_SIGNATURE'
  | 'INVALID_COMMITMENT'
  | 'INVALID_SHARE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_FULL'
  | 'NOT_AUTHORIZED'
  | 'INVALID_STATE'
  | 'THRESHOLD_NOT_MET'
  | 'DUPLICATE_PARTICIPANT'
  | 'NETWORK_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Error response from frostd.
 */
export interface FrostError {
  /** Error code */
  code: FrostErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

// =============================================================================
// Ceremony State Types (for state machines)
// =============================================================================

/**
 * Context for coordinator state machine.
 */
export interface CoordinatorContext {
  /** Current session info */
  session: SessionInfo | null;
  /** Collected commitments from participants */
  commitments: Map<ParticipantId, SigningCommitment>;
  /** Collected signature shares */
  signatureShares: Map<ParticipantId, FrostSignatureShare>;
  /** Message to be signed */
  message: string | null;
  /** Final aggregate signature */
  aggregateSignature: AggregateSignature | null;
  /** Any error that occurred */
  error: FrostError | null;
}

/**
 * Context for participant state machine.
 */
export interface ParticipantContext {
  /** Current session info */
  session: SessionInfo | null;
  /** This participant's key package */
  keyPackage: FrostKeyPackage | null;
  /** Generated nonces for current signing round */
  nonces: SigningNonces | null;
  /** This participant's commitment */
  commitment: SigningCommitment | null;
  /** All received commitments */
  allCommitments: SigningCommitment[];
  /** This participant's signature share */
  signatureShare: FrostSignatureShare | null;
  /** Any error that occurred */
  error: FrostError | null;
}
