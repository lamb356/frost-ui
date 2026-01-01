/**
 * FROST WASM Loader
 *
 * Dynamically loads the FROST WASM module in Next.js and provides
 * typed wrapper functions for threshold signature operations.
 */

// =============================================================================
// Types (matching Rust structures)
// =============================================================================

export interface KeyShare {
  identifier: number;
  signing_share: string;
  verifying_share: string;
}

export interface KeyGenResult {
  group_public_key: string;
  shares: KeyShare[];
  threshold: number;
  total: number;
}

export interface Commitment {
  identifier: number;
  hiding: string;
  binding: string;
}

export interface SigningNonces {
  identifier: number;
  hiding: string;
  binding: string;
}

export interface Round1Result {
  commitment: Commitment;
  nonces: SigningNonces;
}

export interface SignatureShare {
  identifier: number;
  share: string;
}

export interface AggregateSignature {
  r: string;
  s: string;
  signature: string;
}

export interface FrostError {
  code: string;
  message: string;
}

export type FrostResult<T> = T | FrostError;

// =============================================================================
// WASM Module Interface
// =============================================================================

interface FrostWasmModule {
  generate_key_shares(threshold: number, total: number): string;
  generate_round1_commitment(signing_share_hex: string, identifier: number): string;
  generate_round2_signature(
    signing_share_hex: string,
    nonces_json: string,
    commitments_json: string,
    message_hex: string,
    identifier: number
  ): string;
  aggregate_signature(
    shares_json: string,
    commitments_json: string,
    message_hex: string,
    group_public_key_hex: string
  ): string;
  verify_signature(
    signature_hex: string,
    message_hex: string,
    group_public_key_hex: string
  ): string;
}

// =============================================================================
// Loader State
// =============================================================================

let wasmModule: FrostWasmModule | null = null;
let loadingPromise: Promise<FrostWasmModule> | null = null;
let loadError: Error | null = null;

// =============================================================================
// Loader Functions
// =============================================================================

/**
 * Check if WASM module is loaded and ready.
 */
export function isWasmReady(): boolean {
  return wasmModule !== null;
}

/**
 * Check if WASM loading failed.
 */
export function hasWasmError(): boolean {
  return loadError !== null;
}

/**
 * Get the WASM loading error if any.
 */
export function getWasmError(): Error | null {
  return loadError;
}

/**
 * Load the FROST WASM module.
 * Returns a promise that resolves when the module is ready.
 *
 * Note: The WASM module is built by CI and may not exist during local development.
 * If the module is not available, this will throw an error and the caller
 * should fall back to the mock implementation.
 */
export async function loadFrostWasm(): Promise<FrostWasmModule> {
  // Already loaded
  if (wasmModule) {
    return wasmModule;
  }

  // Already loading
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  loadingPromise = (async () => {
    try {
      // Dynamic import of the WASM module
      // The module should be built with wasm-pack and placed in the pkg directory
      // Using a variable to prevent static analysis from failing the build
      const modulePath = './pkg/frost_wasm';
      const wasm = await import(/* webpackIgnore: true */ modulePath);

      // Initialize the WASM module (if there's an init function)
      if (typeof wasm.default === 'function') {
        await wasm.default();
      }

      wasmModule = wasm as unknown as FrostWasmModule;
      console.log('[FROST WASM] Module loaded successfully');
      return wasmModule;
    } catch (error) {
      loadError = error instanceof Error ? error : new Error(String(error));
      console.error('[FROST WASM] Failed to load module:', loadError);
      throw loadError;
    }
  })();

  return loadingPromise;
}

// =============================================================================
// Helper Functions
// =============================================================================

function isError(result: unknown): result is FrostError {
  return typeof result === 'object' && result !== null && 'code' in result && 'message' in result;
}

function parseResult<T>(json: string): T {
  const parsed = JSON.parse(json);
  if (isError(parsed)) {
    throw new Error(`FROST Error [${parsed.code}]: ${parsed.message}`);
  }
  return parsed as T;
}

// =============================================================================
// FROST Operations (with WASM)
// =============================================================================

/**
 * Generate key shares using trusted dealer key generation.
 *
 * @param threshold - Minimum number of signers required (t)
 * @param total - Total number of participants (n)
 * @returns Key generation result with group public key and individual shares
 */
export async function generateKeyShares(
  threshold: number,
  total: number
): Promise<KeyGenResult> {
  const wasm = await loadFrostWasm();
  const result = wasm.generate_key_shares(threshold, total);
  return parseResult<KeyGenResult>(result);
}

/**
 * Generate Round 1 commitment and nonces.
 *
 * @param signingShare - The participant's signing share (hex-encoded)
 * @param identifier - Participant identifier (1-indexed)
 * @returns Commitment (to broadcast) and nonces (to keep secret)
 */
export async function generateRound1Commitment(
  signingShare: string,
  identifier: number
): Promise<Round1Result> {
  const wasm = await loadFrostWasm();
  const result = wasm.generate_round1_commitment(signingShare, identifier);
  return parseResult<Round1Result>(result);
}

/**
 * Generate Round 2 signature share.
 *
 * @param signingShare - The participant's signing share (hex-encoded)
 * @param nonces - The nonces from Round 1 (keep secret!)
 * @param commitments - All participants' commitments
 * @param messageHex - Message to sign (hex-encoded)
 * @param identifier - Participant identifier
 * @returns Signature share
 */
export async function generateRound2Signature(
  signingShare: string,
  nonces: SigningNonces,
  commitments: Commitment[],
  messageHex: string,
  identifier: number
): Promise<SignatureShare> {
  const wasm = await loadFrostWasm();
  const result = wasm.generate_round2_signature(
    signingShare,
    JSON.stringify(nonces),
    JSON.stringify(commitments),
    messageHex,
    identifier
  );
  return parseResult<SignatureShare>(result);
}

/**
 * Aggregate signature shares into final signature.
 *
 * @param shares - All signature shares
 * @param commitments - All commitments
 * @param messageHex - Message that was signed (hex-encoded)
 * @param groupPublicKey - Group public key (hex-encoded)
 * @returns Aggregate signature
 */
export async function aggregateSignature(
  shares: SignatureShare[],
  commitments: Commitment[],
  messageHex: string,
  groupPublicKey: string
): Promise<AggregateSignature> {
  const wasm = await loadFrostWasm();
  const result = wasm.aggregate_signature(
    JSON.stringify(shares),
    JSON.stringify(commitments),
    messageHex,
    groupPublicKey
  );
  return parseResult<AggregateSignature>(result);
}

/**
 * Verify a signature.
 *
 * @param signature - The aggregate signature (hex-encoded, 64 bytes)
 * @param messageHex - The message that was signed (hex-encoded)
 * @param groupPublicKey - The group public key (hex-encoded)
 * @returns true if valid, false otherwise
 */
export async function verifySignature(
  signature: string,
  messageHex: string,
  groupPublicKey: string
): Promise<boolean> {
  const wasm = await loadFrostWasm();
  const result = wasm.verify_signature(signature, messageHex, groupPublicKey);
  const parsed = parseResult<{ valid: boolean }>(result);
  return parsed.valid;
}

// =============================================================================
// Mock Implementation (fallback when WASM unavailable)
// =============================================================================

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Mock key generation (for demo/testing when WASM unavailable).
 */
export function mockGenerateKeyShares(
  threshold: number,
  total: number
): KeyGenResult {
  const shares: KeyShare[] = [];
  for (let i = 1; i <= total; i++) {
    shares.push({
      identifier: i,
      signing_share: randomHex(32),
      verifying_share: randomHex(32),
    });
  }
  return {
    group_public_key: randomHex(32),
    shares,
    threshold,
    total,
  };
}

/**
 * Mock Round 1 commitment (for demo/testing).
 */
export function mockGenerateRound1Commitment(
  _signingShare: string,
  identifier: number
): Round1Result {
  return {
    commitment: {
      identifier,
      hiding: randomHex(32),
      binding: randomHex(32),
    },
    nonces: {
      identifier,
      hiding: randomHex(32),
      binding: randomHex(32),
    },
  };
}

/**
 * Mock Round 2 signature share (for demo/testing).
 */
export function mockGenerateRound2Signature(
  _signingShare: string,
  _nonces: SigningNonces,
  _commitments: Commitment[],
  _messageHex: string,
  identifier: number
): SignatureShare {
  return {
    identifier,
    share: randomHex(32),
  };
}

/**
 * Mock signature aggregation (for demo/testing).
 */
export function mockAggregateSignature(
  _shares: SignatureShare[],
  _commitments: Commitment[],
  _messageHex: string,
  _groupPublicKey: string
): AggregateSignature {
  const r = randomHex(32);
  const s = randomHex(32);
  return {
    r,
    s,
    signature: r + s,
  };
}

/**
 * Mock verification (always returns true for demo).
 */
export function mockVerifySignature(
  _signature: string,
  _messageHex: string,
  _groupPublicKey: string
): boolean {
  return true;
}

// =============================================================================
// Unified API (uses WASM if available, falls back to mock)
// =============================================================================

export interface FrostOperations {
  generateKeyShares: typeof generateKeyShares;
  generateRound1Commitment: typeof generateRound1Commitment;
  generateRound2Signature: typeof generateRound2Signature;
  aggregateSignature: typeof aggregateSignature;
  verifySignature: typeof verifySignature;
  isRealCrypto: boolean;
}

/**
 * Get FROST operations, using WASM if available or mock otherwise.
 */
export async function getFrostOperations(): Promise<FrostOperations> {
  try {
    await loadFrostWasm();
    return {
      generateKeyShares,
      generateRound1Commitment,
      generateRound2Signature,
      aggregateSignature,
      verifySignature,
      isRealCrypto: true,
    };
  } catch {
    console.warn('[FROST] WASM unavailable, using mock implementation');
    return {
      generateKeyShares: async (t, n) => mockGenerateKeyShares(t, n),
      generateRound1Commitment: async (s, i) => mockGenerateRound1Commitment(s, i),
      generateRound2Signature: async (s, n, c, m, i) => mockGenerateRound2Signature(s, n, c, m, i),
      aggregateSignature: async (s, c, m, g) => mockAggregateSignature(s, c, m, g),
      verifySignature: async (s, m, g) => mockVerifySignature(s, m, g),
      isRealCrypto: false,
    };
  }
}
