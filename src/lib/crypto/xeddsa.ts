/**
 * XEdDSA Signature Scheme Implementation
 *
 * XEdDSA allows signing with X25519 keys by converting them to Ed25519 format.
 * This enables using a single keypair for both ECDH (encryption) and signing.
 *
 * Based on the Signal Protocol specification:
 * https://signal.org/docs/specifications/xeddsa/
 *
 * Key differences from standard Ed25519:
 * 1. Takes X25519 (Montgomery) private key instead of Ed25519 private key
 * 2. Uses randomized nonces (not deterministic like Ed25519)
 * 3. Adjusts the sign bit to ensure consistent public key representation
 *
 * This implementation is spec-compliant with frostd authentication.
 */

import { sha512 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { mod } from '@noble/curves/abstract/modular.js';
import {
  bytesToNumberLE,
  numberToBytesLE,
  concatBytes,
  randomBytes,
} from '@noble/curves/utils.js';

// Ed25519 curve order (n)
const CURVE_ORDER = BigInt(
  '7237005577332262213973186563042994240857116359379907606001950938285454250989'
);

// Hash prefix for hash_i functions per Signal XEdDSA spec:
// hash_i uses 32 bytes where first byte = 0xFF - i, rest = 0xFF
// hash1: [0xFE, 0xFF, 0xFF, ..., 0xFF] (32 bytes)
const HASH1_PREFIX = new Uint8Array(32);
HASH1_PREFIX.fill(0xff);
HASH1_PREFIX[0] = 0xfe; // hash1 uses 0xFE as first byte

/**
 * XEdDSA key pair derived from an X25519 private key.
 *
 * The Edwards public key (A) has its sign bit forced to 0.
 * The adjusted private key (a) is negated if the original sign bit was 1.
 */
interface XEdDSAKeyPair {
  /** Ed25519 public key with sign bit 0 (32 bytes) */
  publicKey: Uint8Array;
  /** Adjusted Ed25519 private scalar (32 bytes) */
  privateScalar: bigint;
  /** True if the original point had sign bit 1 and we negated the scalar */
  needsNegation: boolean;
}

/**
 * Calculate the XEdDSA key pair from an X25519 private key.
 *
 * Per the XEdDSA spec:
 * 1. Compute E = k * B (scalar multiplication on Ed25519)
 * 2. If E.x is odd (sign bit = 1), negate k
 * 3. Return public key with sign bit 0 and adjusted private scalar
 *
 * @param x25519PrivateKey - X25519 private key (32 bytes, clamped)
 * @returns XEdDSA key pair
 */
function calculateKeyPair(x25519PrivateKey: Uint8Array): XEdDSAKeyPair {
  // X25519 private keys are already clamped, but we need to interpret
  // them as an Ed25519 scalar. The clamping clears the 3 lowest bits
  // and sets bit 254, which is compatible with Ed25519.

  // Convert private key bytes to scalar
  let k = bytesToNumberLE(x25519PrivateKey);

  // Apply Ed25519 clamping (same as X25519 clamping)
  // Clear lowest 3 bits, clear bit 255, set bit 254
  k = k & ~BigInt(7); // Clear bits 0, 1, 2
  k = k & ~(BigInt(1) << BigInt(255)); // Clear bit 255
  k = k | (BigInt(1) << BigInt(254)); // Set bit 254

  // Reduce k mod curve order before multiplication
  // The multiply function expects 1 <= scalar < n
  k = mod(k, CURVE_ORDER);

  // Compute E = k * B (scalar multiplication on Ed25519 curve)
  const E = ed25519.Point.BASE.multiply(k);

  // Get the affine coordinates
  const affine = E.toAffine();

  // Check the sign bit (lowest bit of x-coordinate)
  // In Ed25519, the sign bit is x mod 2
  const signBit = affine.x & BigInt(1);

  const needsNegation = signBit === BigInt(1);
  let a: bigint;
  if (needsNegation) {
    // Negate the private key: a = -k mod n
    a = mod(-k, CURVE_ORDER);
  } else {
    // Keep as-is: a = k mod n
    a = mod(k, CURVE_ORDER);
  }

  // Compute the public key point with the adjusted scalar
  // This ensures A has sign bit 0
  const A = ed25519.Point.BASE.multiply(a);
  const publicKey = A.toBytes();

  return {
    publicKey,
    privateScalar: a,
    needsNegation,
  };
}

/**
 * Hash function with domain separation (hash1 in the spec).
 *
 * hash1(X) = SHA-512(2^255 || X)
 *
 * The 2^255 prefix provides domain separation from the regular hash.
 */
function hash1(...data: Uint8Array[]): Uint8Array {
  return sha512(concatBytes(HASH1_PREFIX, ...data));
}

/**
 * Regular hash function for challenge generation.
 *
 * hash(X) = SHA-512(X)
 */
function hash(...data: Uint8Array[]): Uint8Array {
  return sha512(concatBytes(...data));
}

/**
 * Reduce a 64-byte hash output to a scalar mod n.
 *
 * This is the same reduction used in Ed25519 for converting
 * hash outputs to scalars.
 */
function hashToScalar(hashOutput: Uint8Array): bigint {
  // Ed25519 uses little-endian 64-byte hash reduced mod n
  const num = bytesToNumberLE(hashOutput);
  return mod(num, CURVE_ORDER);
}

/**
 * Sign a message using XEdDSA.
 *
 * Per the XEdDSA spec:
 * 1. Calculate XEdDSA key pair from X25519 private key
 * 2. Generate nonce: r = hash1(a || M || Z) mod n
 * 3. Compute R = r * B
 * 4. Compute challenge: h = hash(R || A || M) mod n
 * 5. Compute s = r + h*a mod n
 * 6. Return signature R || s (64 bytes)
 *
 * @param x25519PrivateKey - X25519 private key (32 bytes)
 * @param message - Message to sign
 * @param random - 64 bytes of random data (optional, generated if not provided)
 * @returns XEdDSA signature (64 bytes: R || s)
 */
// Debug flag - set to true to enable verbose logging
const XEDDSA_DEBUG = typeof process !== 'undefined' && process.env.XEDDSA_DEBUG === '1';

function debugHex(name: string, bytes: Uint8Array): void {
  if (!XEDDSA_DEBUG) return;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log(`  ${name}: ${hex}`);
}

export function xeddsaSign(
  x25519PrivateKey: Uint8Array,
  message: Uint8Array,
  random?: Uint8Array
): Uint8Array {
  if (x25519PrivateKey.length !== 32) {
    throw new Error('X25519 private key must be 32 bytes');
  }

  // Get random bytes if not provided
  const Z = random ?? randomBytes(64);
  if (Z.length !== 64) {
    throw new Error('Random data must be 64 bytes');
  }

  if (XEDDSA_DEBUG) {
    console.log('\n=== XEdDSA Sign Debug ===');
    debugHex('x25519PrivateKey', x25519PrivateKey);
    debugHex('message', message);
    debugHex('Z (random)', Z);
  }

  // Calculate XEdDSA key pair (Ed25519 public key with sign bit 0)
  const { publicKey: A, privateScalar: a } = calculateKeyPair(x25519PrivateKey);

  if (XEDDSA_DEBUG) {
    debugHex('A (Ed25519 pubkey from privkey)', A);
    console.log(`  a (scalar): ${a.toString(16)}`);

    // Also compute Ed25519 pubkey from X25519 pubkey (as verifier would)
    // to verify they match
    const x25519PubKey = x25519GetPublicKey(x25519PrivateKey);
    debugHex('X25519 pubkey (computed)', x25519PubKey);

    // Convert X25519 pubkey to Ed25519 (as frostd would do)
    const p = ed25519.Point.CURVE().p;
    const u = bytesToNumberLE(x25519PubKey);
    const uMinus1 = mod(u - BigInt(1), p);
    const uPlus1 = mod(u + BigInt(1), p);
    const uPlus1Inv = modInverse(uPlus1, p);
    const y_from_u = mod(uMinus1 * uPlus1Inv, p);
    const A_from_u = numberToBytesLE(y_from_u, 32);
    // Ensure sign bit is 0
    A_from_u[31] &= 0x7f;
    debugHex('A (Ed25519 pubkey from X25519)', A_from_u);

    // Check if they match
    const matches = A.every((b, i) => b === A_from_u[i]);
    console.log(`  Ed25519 pubkeys match: ${matches}`);
  }

  // Generate nonce: r = hash1(a || M || Z) mod n
  // Per ockam_vault implementation: use the ADJUSTED SCALAR (after negation if needed)
  const aBytes = numberToBytesLE(a, 32);
  const rHash = hash1(aBytes, message, Z);
  const r = hashToScalar(rHash);

  if (XEDDSA_DEBUG) {
    debugHex('hash1(a||M||Z)', rHash);
    console.log(`  r (scalar): ${r.toString(16)}`);
  }

  // Compute R = r * B
  const R = ed25519.Point.BASE.multiply(r);
  const RBytes = R.toBytes();

  if (XEDDSA_DEBUG) {
    debugHex('R', RBytes);
  }

  // Compute challenge: h = hash(R || A || M) mod n
  // Per XEdDSA spec: use Ed25519 public key A (with sign bit 0) in challenge hash
  const hHash = hash(RBytes, A, message);
  const h = hashToScalar(hHash);

  if (XEDDSA_DEBUG) {
    debugHex('hash(R||A||M)', hHash);
    console.log(`  h (scalar): ${h.toString(16)}`);
  }

  // Compute s = r + h*a mod n
  const s = mod(r + h * a, CURVE_ORDER);
  const sBytes = numberToBytesLE(s, 32);

  if (XEDDSA_DEBUG) {
    console.log(`  s = r + h*a mod n: ${s.toString(16)}`);
    debugHex('sBytes', sBytes);
  }

  // Return signature R || s (64 bytes)
  const signature = concatBytes(RBytes, sBytes);

  if (XEDDSA_DEBUG) {
    debugHex('signature (R||s)', signature);
    console.log('=== End XEdDSA Debug ===\n');
  }

  return signature;
}

/**
 * Get the X25519 public key from an X25519 private key.
 * This is a simple scalar multiplication on the Montgomery curve.
 */
function x25519GetPublicKey(privateKey: Uint8Array): Uint8Array {
  // Use the x25519 basepoint multiplication
  // The basepoint for X25519 is u=9
  const basepoint = new Uint8Array(32);
  basepoint[0] = 9;

  // Perform scalar multiplication using the ed25519 module's x25519 utilities
  // Note: We need to import x25519 from noble/curves
  // For now, use a different approach - derive from Edwards point

  // Actually, the easiest way is to compute the Edwards point and convert to Montgomery
  // A = a * B (Edwards), then convert to Montgomery u-coordinate

  const { publicKey: A } = calculateKeyPair(privateKey);

  // Convert Edwards y-coordinate to Montgomery u-coordinate
  // u = (1 + y) / (1 - y) mod p
  const p = ed25519.Point.CURVE().p;

  // Extract y from the encoded Ed25519 point (first 255 bits, little-endian)
  // Clear the sign bit to get y
  const yBytes = A.slice();
  yBytes[31] &= 0x7f; // Clear sign bit
  const y = bytesToNumberLE(yBytes);

  // u = (1 + y) / (1 - y) mod p
  const onePlusY = mod(BigInt(1) + y, p);
  const oneMinusY = mod(BigInt(1) - y, p);
  const oneMinusYInv = modInverse(oneMinusY, p);
  const u = mod(onePlusY * oneMinusYInv, p);

  return numberToBytesLE(u, 32);
}

/**
 * Verify an XEdDSA signature.
 *
 * Per the XEdDSA spec:
 * 1. Convert X25519 public key to Ed25519 public key
 * 2. Parse signature as R || s
 * 3. Compute challenge: h = hash(R || A || M) mod n
 * 4. Verify: s*B = R + h*A
 *
 * @param x25519PublicKey - X25519 public key (32 bytes, u-coordinate)
 * @param message - Signed message
 * @param signature - XEdDSA signature (64 bytes: R || s)
 * @returns true if signature is valid
 */
export function xeddsaVerify(
  x25519PublicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  if (x25519PublicKey.length !== 32) {
    throw new Error('X25519 public key must be 32 bytes');
  }
  if (signature.length !== 64) {
    throw new Error('Signature must be 64 bytes');
  }

  try {
    // Convert X25519 public key (Montgomery u-coordinate) to Ed25519 public key
    // We need to compute the Edwards y-coordinate from Montgomery u
    // y = (u - 1) / (u + 1)
    const u = bytesToNumberLE(x25519PublicKey);
    const p = ed25519.Point.CURVE().p;

    // Check u is valid (u < p)
    if (u >= p) {
      return false;
    }

    // Compute y = (u - 1) / (u + 1) mod p
    const uMinus1 = mod(u - BigInt(1), p);
    const uPlus1 = mod(u + BigInt(1), p);

    // Check uPlus1 is not zero (would mean u = -1)
    if (uPlus1 === BigInt(0)) {
      return false;
    }

    // Modular inverse of (u + 1)
    const uPlus1Inv = modInverse(uPlus1, p);
    const y = mod(uMinus1 * uPlus1Inv, p);

    // Encode y as Ed25519 public key (with sign bit 0)
    const A = numberToBytesLE(y, 32);

    // Parse signature
    const RBytes = signature.slice(0, 32);
    const sBytes = signature.slice(32, 64);

    // Parse R as a point
    const R = ed25519.Point.fromBytes(RBytes);

    // Parse s as a scalar
    const s = bytesToNumberLE(sBytes);

    // Check s is valid (s < n)
    if (s >= CURVE_ORDER) {
      return false;
    }

    // Compute challenge: h = hash(R || A || M) mod n
    const hHash = hash(RBytes, A, message);
    const h = hashToScalar(hHash);

    // Verify: s*B = R + h*A
    // Rearranged: s*B - h*A = R
    const sB = ed25519.Point.BASE.multiply(s);
    const hA = ed25519.Point.fromBytes(A).multiply(h);
    const RCheck = sB.add(hA.negate());

    // Compare R with RCheck
    return R.equals(RCheck);
  } catch {
    return false;
  }
}

/**
 * Modular multiplicative inverse using extended Euclidean algorithm.
 */
function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [BigInt(1), BigInt(0)];

  while (r !== BigInt(0)) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }

  return mod(old_s, m);
}

/**
 * Get the Ed25519 public key that corresponds to an X25519 private key
 * for XEdDSA signing.
 *
 * This is the public key that verifiers will use, with sign bit forced to 0.
 *
 * @param x25519PrivateKey - X25519 private key (32 bytes)
 * @returns Ed25519 public key (32 bytes)
 */
export function xeddsaGetPublicKey(x25519PrivateKey: Uint8Array): Uint8Array {
  const { publicKey } = calculateKeyPair(x25519PrivateKey);
  return publicKey;
}

/**
 * Convert an X25519 public key to the Ed25519 public key format
 * used for XEdDSA verification.
 *
 * @param x25519PublicKey - X25519 public key (32 bytes, u-coordinate)
 * @returns Ed25519 public key (32 bytes, with sign bit 0)
 */
export function x25519ToEd25519PublicKey(
  x25519PublicKey: Uint8Array
): Uint8Array {
  const u = bytesToNumberLE(x25519PublicKey);
  const p = ed25519.Point.CURVE().p;

  // y = (u - 1) / (u + 1) mod p
  const uMinus1 = mod(u - BigInt(1), p);
  const uPlus1 = mod(u + BigInt(1), p);
  const uPlus1Inv = modInverse(uPlus1, p);
  const y = mod(uMinus1 * uPlus1Inv, p);

  // Return y with sign bit 0 (least significant bit of encoded y is the sign)
  return numberToBytesLE(y, 32);
}
