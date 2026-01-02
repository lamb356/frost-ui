/**
 * Backend-agnostic FROST interface types.
 *
 * This module defines a unified interface for FROST threshold signatures
 * that works across different curve implementations (Ed25519, RedPallas).
 */

/**
 * Supported FROST backend identifiers.
 */
export type BackendId = 'ed25519' | 'orchard-redpallas';

/**
 * Result of key generation.
 */
export interface KeyGenResult {
  /** Group verifying key (hex-encoded) */
  groupPublicKey: string;
  /** Individual key shares for each participant */
  shares: Array<{
    /** Participant identifier (1-indexed) */
    identifier: number;
    /** Serialized key package (JSON) - KEEP SECRET */
    keyPackage: string;
  }>;
  /** Serialized public key package (JSON) - needed for aggregation */
  publicKeyPackage: string;
  /** Threshold required for signing */
  threshold: number;
  /** Total number of participants */
  total: number;
}

/**
 * Result of Round 1 commitment generation.
 */
export interface Round1Result {
  /** Serialized nonces (JSON) - KEEP SECRET, single use only */
  nonces: string;
  /** Serialized commitment (JSON) - broadcast to coordinator */
  commitment: string;
  /** Participant identifier */
  identifier: number;
}

/**
 * Result of creating a signing package (Orchard only).
 */
export interface SigningPackageResult {
  /** Serialized signing package (JSON) */
  signingPackage: string;
  /** Serialized randomizer (JSON) - distribute to signers */
  randomizer: string;
}

/**
 * Backend-agnostic FROST interface.
 *
 * All FROST backends (Ed25519, RedPallas) implement this interface.
 * The interface handles differences in rerandomization transparently.
 */
export interface FrostBackend {
  /** Backend identifier for protocol negotiation */
  readonly backendId: BackendId;

  /**
   * Generate key shares using trusted dealer.
   *
   * @param threshold Minimum signers required (t)
   * @param total Total number of signers (n)
   * @returns Key generation result with shares
   */
  generateKeyShares(threshold: number, total: number): Promise<KeyGenResult>;

  /**
   * Generate Round 1 commitment and nonces.
   *
   * @param keyPackage Participant's key package (JSON)
   * @returns Nonces (secret) and commitment (public)
   */
  generateRound1(keyPackage: string): Promise<Round1Result>;

  /**
   * Generate Round 2 signature share.
   *
   * @param keyPackage Participant's key package (JSON)
   * @param nonces Nonces from Round 1 (JSON) - consumed after use
   * @param signingPackage Signing package from coordinator (JSON)
   * @param randomizer Randomizer (JSON) - required for Orchard, ignored for Ed25519
   * @returns Signature share (JSON)
   */
  generateRound2(
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    randomizer?: string
  ): Promise<string>;

  /**
   * Aggregate signature shares into final signature.
   *
   * @param signingPackage Signing package (JSON)
   * @param signatureShares Map of identifier → signature share (JSON)
   * @param publicKeyPackage Public key package (JSON)
   * @param randomizer Randomizer (JSON) - required for Orchard, ignored for Ed25519
   * @returns Final aggregate signature (hex)
   */
  aggregateSignature(
    signingPackage: string,
    signatureShares: Record<string, string>,
    publicKeyPackage: string,
    randomizer?: string
  ): Promise<string>;

  /**
   * Verify a signature.
   *
   * @param signature Signature to verify (hex)
   * @param message Message that was signed (hex)
   * @param groupPublicKey Group public key (hex)
   * @param randomizer Randomizer (JSON) - required for Orchard, ignored for Ed25519
   * @returns true if signature is valid
   */
  verifySignature(
    signature: string,
    message: string,
    groupPublicKey: string,
    randomizer?: string
  ): Promise<boolean>;

  /**
   * Create signing package with randomizer (Orchard only).
   *
   * For Ed25519, this method is not available - create signing package
   * manually from commitments and message.
   *
   * @param message Message to sign (hex)
   * @param commitments Map of identifier → commitment (JSON)
   * @param publicKeyPackage Public key package (JSON)
   * @returns Signing package and randomizer
   */
  createSigningPackage?(
    message: string,
    commitments: Record<string, string>,
    publicKeyPackage: string
  ): Promise<SigningPackageResult>;
}

/**
 * Check if a backend supports rerandomization (Orchard).
 */
export function supportsRerandomization(backend: FrostBackend): boolean {
  return backend.backendId === 'orchard-redpallas';
}

/**
 * Check if a backend has createSigningPackage method.
 */
export function hasCreateSigningPackage(
  backend: FrostBackend
): backend is FrostBackend & Required<Pick<FrostBackend, 'createSigningPackage'>> {
  return typeof backend.createSigningPackage === 'function';
}
