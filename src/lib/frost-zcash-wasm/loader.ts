/**
 * FROST Zcash WASM Loader
 *
 * TypeScript bindings for FROST rerandomized threshold signatures
 * using RedPallas curve (Zcash Orchard compatible).
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Error response from WASM functions
 */
export interface FrostError {
  code: string;
  message: string;
}

/**
 * Individual key share for a participant
 */
export interface KeyShareInfo {
  /** Participant identifier (1-indexed) */
  identifier: number;
  /** Serialized KeyPackage (JSON) - keep secret! */
  key_package: string;
}

/**
 * Result of key generation
 */
export interface KeyGenResult {
  /** Group verifying key (hex) */
  group_public_key: string;
  /** Individual key shares */
  shares: KeyShareInfo[];
  /** Threshold required */
  threshold: number;
  /** Total participants */
  total: number;
  /** Serialized PublicKeyPackage (JSON) */
  public_key_package: string;
}

/**
 * Commitment info for Round 1
 */
export interface CommitmentInfo {
  /** Participant identifier */
  identifier: number;
  /** Serialized SigningCommitments (JSON) */
  commitment: string;
}

/**
 * Nonces info for Round 1 (keep secret!)
 */
export interface NoncesInfo {
  /** Participant identifier */
  identifier: number;
  /** Serialized SigningNonces (JSON) */
  nonces: string;
}

/**
 * Result of Round 1 commitment generation
 */
export interface Round1Result {
  /** Public commitment to broadcast */
  commitment: CommitmentInfo;
  /** Secret nonces - MUST NOT be reused! */
  nonces: NoncesInfo;
}

/**
 * Randomizer result
 */
export interface RandomizerResult {
  /** Randomizer (JSON serialized) */
  randomizer: string;
}

/**
 * Signature share from Round 2
 */
export interface SignatureShareInfo {
  /** Participant identifier */
  identifier: number;
  /** Serialized SignatureShare (JSON) */
  share: string;
}

/**
 * Result of signature aggregation
 */
export interface AggregateResult {
  /** Final aggregate signature (hex) */
  signature: string;
  /** Randomizer used (JSON) */
  randomizer: string;
}

/**
 * Signature verification result
 */
export interface VerifyResult {
  valid: boolean;
}

/**
 * Public key info
 */
export interface PublicKeyResult {
  public_key: string;
  identifier: number;
}

// =============================================================================
// WASM Module Interface
// =============================================================================

interface FrostZcashWasm {
  init(): void;
  generate_key_shares(threshold: number, total: number): string;
  generate_round1_commitment(key_package_json: string): string;
  generate_randomizer(): string;
  generate_round2_signature(
    key_package_json: string,
    nonces_json: string,
    commitments_json: string,
    message_hex: string,
    randomizer_json: string
  ): string;
  aggregate_signature(
    shares_json: string,
    commitments_json: string,
    message_hex: string,
    public_key_package_json: string,
    randomizer_json: string
  ): string;
  verify_signature(
    signature_hex: string,
    message_hex: string,
    group_public_key_hex: string,
    randomizer_json: string
  ): string;
  get_public_key(key_package_json: string): string;
  get_group_public_key(public_key_package_json: string): string;
}

// WASM module singleton
let wasmModule: FrostZcashWasm | null = null;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the FROST Zcash WASM module
 */
export async function initFrostZcash(): Promise<void> {
  if (wasmModule) return;

  const module = await import('./pkg/frost_zcash_wasm.js');

  // For web builds, we may need to call default() to initialize
  if (typeof module.default === 'function') {
    await module.default();
  }

  module.init();
  wasmModule = module as unknown as FrostZcashWasm;
}

/**
 * Get the WASM module, throwing if not initialized
 */
function getWasm(): FrostZcashWasm {
  if (!wasmModule) {
    throw new Error('FROST Zcash WASM not initialized. Call initFrostZcash() first.');
  }
  return wasmModule;
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseResult<T>(json: string): T {
  const result = JSON.parse(json);
  if (result.code && result.message) {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result as T;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate FROST key shares using trusted dealer
 *
 * @param threshold Minimum signers required (t)
 * @param total Total number of signers (n)
 * @returns Key generation result with shares
 */
export function generateKeyShares(threshold: number, total: number): KeyGenResult {
  const wasm = getWasm();
  return parseResult<KeyGenResult>(wasm.generate_key_shares(threshold, total));
}

/**
 * Generate Round 1 commitment
 *
 * @param keyPackageJson Participant's key package (from KeyGenResult.shares)
 * @returns Commitment and nonces (nonces must be kept secret!)
 */
export function generateRound1Commitment(keyPackageJson: string): Round1Result {
  const wasm = getWasm();
  return parseResult<Round1Result>(wasm.generate_round1_commitment(keyPackageJson));
}

/**
 * Generate a randomizer for rerandomized signing
 *
 * This should be called by the coordinator and distributed to all signers
 * via a secure channel before Round 2.
 *
 * @returns Randomizer (JSON serialized)
 */
export function generateRandomizer(): RandomizerResult {
  const wasm = getWasm();
  return parseResult<RandomizerResult>(wasm.generate_randomizer());
}

/**
 * Generate Round 2 signature share
 *
 * @param keyPackageJson Participant's key package
 * @param noncesJson Nonces from Round 1 (must be JSON.stringify'd NoncesInfo)
 * @param commitmentsJson All commitments (JSON array of CommitmentInfo)
 * @param messageHex Message to sign (hex-encoded)
 * @param randomizerJson Randomizer from coordinator (JSON)
 * @returns Signature share
 */
export function generateRound2Signature(
  keyPackageJson: string,
  noncesJson: string,
  commitmentsJson: string,
  messageHex: string,
  randomizerJson: string
): SignatureShareInfo {
  const wasm = getWasm();
  return parseResult<SignatureShareInfo>(
    wasm.generate_round2_signature(
      keyPackageJson,
      noncesJson,
      commitmentsJson,
      messageHex,
      randomizerJson
    )
  );
}

/**
 * Aggregate signature shares into final signature
 *
 * @param sharesJson All signature shares (JSON array of SignatureShareInfo)
 * @param commitmentsJson All commitments (JSON array of CommitmentInfo)
 * @param messageHex Message that was signed (hex)
 * @param publicKeyPackageJson Public key package (from KeyGenResult)
 * @param randomizerJson Randomizer used for signing (JSON)
 * @returns Aggregate signature
 */
export function aggregateSignature(
  sharesJson: string,
  commitmentsJson: string,
  messageHex: string,
  publicKeyPackageJson: string,
  randomizerJson: string
): AggregateResult {
  const wasm = getWasm();
  return parseResult<AggregateResult>(
    wasm.aggregate_signature(
      sharesJson,
      commitmentsJson,
      messageHex,
      publicKeyPackageJson,
      randomizerJson
    )
  );
}

/**
 * Verify a rerandomized signature
 *
 * @param signatureHex Signature (hex-encoded, 64 bytes)
 * @param messageHex Message (hex-encoded)
 * @param groupPublicKeyHex Group public key (hex-encoded, 32 bytes)
 * @param randomizerJson Randomizer used (JSON)
 * @returns Verification result
 */
export function verifySignature(
  signatureHex: string,
  messageHex: string,
  groupPublicKeyHex: string,
  randomizerJson: string
): VerifyResult {
  const wasm = getWasm();
  return parseResult<VerifyResult>(
    wasm.verify_signature(signatureHex, messageHex, groupPublicKeyHex, randomizerJson)
  );
}

/**
 * Get the public key from a key package
 */
export function getPublicKey(keyPackageJson: string): PublicKeyResult {
  const wasm = getWasm();
  return parseResult<PublicKeyResult>(wasm.get_public_key(keyPackageJson));
}

/**
 * Get the group public key from a public key package
 */
export function getGroupPublicKey(publicKeyPackageJson: string): string {
  const wasm = getWasm();
  const result = wasm.get_group_public_key(publicKeyPackageJson);
  // Check for error
  if (result.startsWith('{') && result.includes('"code"')) {
    const error = JSON.parse(result) as FrostError;
    throw new Error(`${error.code}: ${error.message}`);
  }
  return result;
}

// =============================================================================
// Convenience Types for Protocol Messages
// =============================================================================

/**
 * Signing session state (for coordinator)
 */
export interface SigningSession {
  /** Session identifier */
  sessionId: string;
  /** Message to sign (hex) */
  messageHex: string;
  /** Selected signer identifiers */
  signerIds: number[];
  /** Randomizer for this session */
  randomizer: string;
  /** Public key package */
  publicKeyPackage: string;
  /** Collected commitments */
  commitments: CommitmentInfo[];
  /** Collected signature shares */
  shares: SignatureShareInfo[];
}

/**
 * Participant state for signing
 */
export interface ParticipantState {
  /** Key package (keep secret!) */
  keyPackage: string;
  /** Current nonces (keep secret, single use!) */
  nonces: NoncesInfo | null;
  /** Current commitment */
  commitment: CommitmentInfo | null;
}
