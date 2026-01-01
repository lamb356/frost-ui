/**
 * Crypto Utilities for FROST Multi-Sig UI
 *
 * PRODUCTION-READY: This module provides real cryptographic operations using
 * the @noble/ed25519 and @noble/curves libraries.
 *
 * Features:
 * - Ed25519 key generation and signing (for frostd authentication)
 * - Ed25519 to X25519 key conversion (single keypair for auth + encryption)
 * - X25519 ECDH key exchange with AES-GCM encryption (for E2E messaging)
 * - Password-based key encryption for local storage
 *
 * ## IMPORTANT: XEdDSA vs Ed25519 Signature Scheme
 *
 * The frostd specification technically requires XEdDSA signatures, which allow
 * using the same key for both Ed25519 signing AND X25519 encryption. However:
 *
 * **Current Implementation:** Standard Ed25519 signatures (RFC 8032)
 * - Uses @noble/ed25519 for signing
 * - May work with frostd implementations that accept Ed25519
 * - Provides proper Ed25519 -> X25519 key conversion for encryption
 *
 * **Spec-Strict (XEdDSA):** Would require:
 * - Converting Ed25519 private key to X25519 format
 * - Signing with the X25519-derived key using XEdDSA algorithm
 * - See: https://signal.org/docs/specifications/xeddsa/
 *
 * **Recommendation:** Test with your frostd server. Most implementations
 * accept standard Ed25519 signatures. XEdDSA is documented as future work
 * if strict spec compliance is required.
 *
 * See: https://frost.zfnd.org/zcash/server.html
 */

import * as ed from '@noble/ed25519';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';

// We use both:
// - @noble/ed25519 for signAsync/verifyAsync (async-friendly)
// - @noble/curves/ed25519 for ed25519.utils.toMontgomery (key conversion)

// =============================================================================
// Types
// =============================================================================

export interface Ed25519KeyPair {
  /** Ed25519 public key (32 bytes, hex-encoded) */
  publicKey: string;
  /** Ed25519 private key (32 bytes, hex-encoded) - keep secret! */
  privateKey: string;
}

export interface X25519KeyPair {
  /** X25519 public key (32 bytes, hex-encoded) for key exchange */
  publicKey: string;
  /** X25519 private key (32 bytes, hex-encoded) - keep secret! */
  privateKey: string;
}

export interface EncryptedPayload {
  /** Ciphertext (hex-encoded) */
  ciphertext: string;
  /** Nonce (hex-encoded, 12 bytes for AES-GCM) */
  nonce: string;
  /** Ephemeral X25519 public key for ECDH key exchange (hex-encoded) */
  ephemeralPublicKey: string;
}

// =============================================================================
// Encoding Utilities
// =============================================================================

/**
 * Convert a Uint8Array to a hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert a base64 string to a Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a string to Uint8Array using UTF-8.
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert a UUID string to its 16-byte binary representation.
 *
 * UUIDs are 128-bit (16-byte) identifiers typically displayed as
 * 32 hex digits with hyphens (e.g., "550e8400-e29b-41d4-a716-446655440000").
 * This function strips the hyphens and converts to bytes.
 *
 * Per the frostd spec, the challenge is a UUID that should be signed
 * as its binary form, not as a UTF-8 string.
 *
 * @param uuid - UUID string in standard format (with or without hyphens)
 * @returns 16-byte Uint8Array
 */
export function uuidToBytes(uuid: string): Uint8Array {
  // Remove hyphens and validate
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: expected 32 hex chars, got ${hex.length}`);
  }
  // Convert 32 hex characters to 16 bytes
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Decode a Uint8Array to string using UTF-8.
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Convert Uint8Array to ArrayBuffer for WebCrypto API compatibility.
 * WebCrypto's BufferSource type is stricter in TypeScript 5.x.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

// =============================================================================
// Ed25519 Key Generation (PRODUCTION-READY)
// =============================================================================

/**
 * Generate an Ed25519 key pair for frostd authentication.
 *
 * Uses @noble/ed25519 for cryptographically secure key generation.
 * The private key is 32 random bytes, and the public key is derived
 * from it using Ed25519 scalar multiplication.
 *
 * @returns Ed25519 key pair with hex-encoded keys
 */
export async function generateAuthKeyPair(): Promise<Ed25519KeyPair> {
  // Generate 32 random bytes for the private key seed
  const privateKey = ed.utils.randomSecretKey();

  // Derive the public key from the private key
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

// =============================================================================
// Ed25519 Signing (PRODUCTION-READY)
// =============================================================================

/**
 * Sign a challenge for frostd authentication using Ed25519.
 *
 * Per the frostd spec, the challenge is a UUID that must be signed as its
 * 16-byte binary representation (NOT as a UTF-8 string). The UUID is converted
 * from its string form (e.g., "550e8400-e29b-41d4-a716-446655440000") to
 * 16 bytes by stripping hyphens and parsing as hex.
 *
 * NOTE: The frostd spec technically requires XEdDSA signatures, but this
 * implementation uses standard Ed25519. See module header for details.
 *
 * @param privateKeyHex - Ed25519 private key (32 bytes, hex-encoded)
 * @param challenge - UUID challenge string from /challenge endpoint
 * @returns Hex-encoded Ed25519 signature (64 bytes)
 */
export async function signChallenge(
  privateKeyHex: string,
  challenge: string
): Promise<string> {
  const privateKey = hexToBytes(privateKeyHex);
  // Sign the UUID as 16-byte binary (spec-compliant), not UTF-8 string
  const challengeBytes = uuidToBytes(challenge);
  const signature = await ed.signAsync(challengeBytes, privateKey);
  return bytesToHex(signature);
}

/**
 * Verify an Ed25519 signature.
 *
 * @param publicKeyHex - Ed25519 public key (32 bytes, hex-encoded)
 * @param message - The signed message (UTF-8 string)
 * @param signatureHex - Ed25519 signature (64 bytes, hex-encoded)
 * @returns true if signature is valid
 */
export async function verifySignature(
  publicKeyHex: string,
  message: string,
  signatureHex: string
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const messageBytes = stringToBytes(message);
    const signature = hexToBytes(signatureHex);

    // Validate lengths
    if (publicKey.length !== 32) return false;
    if (signature.length !== 64) return false;

    return await ed.verifyAsync(signature, messageBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Verify an Ed25519 signature on a UUID challenge.
 *
 * This is the counterpart to signChallenge - it verifies a signature
 * where the message was the 16-byte binary form of a UUID.
 *
 * @param publicKeyHex - Ed25519 public key (32 bytes, hex-encoded)
 * @param challenge - The UUID challenge that was signed
 * @param signatureHex - Ed25519 signature (64 bytes, hex-encoded)
 * @returns true if signature is valid
 */
export async function verifyChallengeSignature(
  publicKeyHex: string,
  challenge: string,
  signatureHex: string
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    // Use UUID binary format (same as signChallenge)
    const challengeBytes = uuidToBytes(challenge);
    const signature = hexToBytes(signatureHex);

    // Validate lengths
    if (publicKey.length !== 32) return false;
    if (signature.length !== 64) return false;

    return await ed.verifyAsync(signature, challengeBytes, publicKey);
  } catch {
    return false;
  }
}

// =============================================================================
// X25519 Key Generation (for ECDH)
// =============================================================================

/**
 * Generate an X25519 key pair for ECDH key exchange.
 *
 * X25519 is the ECDH variant that uses the same curve as Ed25519.
 * These keys are used for encrypting messages between participants.
 *
 * @returns X25519 key pair with hex-encoded keys
 */
export function generateX25519KeyPair(): X25519KeyPair {
  // Generate 32 random bytes for the private key
  const privateKey = crypto.getRandomValues(new Uint8Array(32));

  // Derive the public key using X25519 base point multiplication
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

/**
 * Perform X25519 ECDH to compute a shared secret.
 *
 * @param ourPrivateKeyHex - Our X25519 private key (32 bytes, hex)
 * @param theirPublicKeyHex - Their X25519 public key (32 bytes, hex)
 * @returns Shared secret (32 bytes, hex-encoded)
 */
export function x25519SharedSecret(
  ourPrivateKeyHex: string,
  theirPublicKeyHex: string
): string {
  const ourPrivate = hexToBytes(ourPrivateKeyHex);
  const theirPublic = hexToBytes(theirPublicKeyHex);
  const sharedSecret = x25519.getSharedSecret(ourPrivate, theirPublic);
  return bytesToHex(sharedSecret);
}

// =============================================================================
// E2E Encryption (PRODUCTION-READY: X25519 ECDH + AES-GCM)
// =============================================================================

/**
 * Derive an AES-GCM key from an X25519 shared secret using HKDF.
 *
 * @param sharedSecret - X25519 shared secret (32 bytes)
 * @returns AES-GCM CryptoKey
 */
async function deriveAesKeyFromSharedSecret(
  sharedSecret: Uint8Array
): Promise<CryptoKey> {
  // Import the shared secret as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(sharedSecret),
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      // Salt and info provide domain separation
      salt: toArrayBuffer(stringToBytes('frost-e2e-encryption-v1')),
      info: toArrayBuffer(stringToBytes('aes-gcm-256')),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message for a recipient using X25519 ECDH + AES-GCM.
 *
 * This is the proper E2E encryption scheme matching what frost-client uses:
 * 1. Generate ephemeral X25519 keypair
 * 2. Compute shared secret with recipient's X25519 public key
 * 3. Derive AES-256-GCM key from shared secret using HKDF
 * 4. Encrypt message with AES-GCM
 *
 * NOTE: This expects the recipient to have an X25519 public key.
 * Ed25519 keys need to be converted to X25519 format first (see ed25519ToX25519).
 *
 * @param recipientX25519PubkeyHex - Recipient's X25519 public key (hex-encoded)
 * @param message - Message to encrypt (UTF-8 string)
 * @returns Encrypted payload containing ciphertext, nonce, and ephemeral public key
 */
export async function encryptMessage(
  recipientX25519PubkeyHex: string,
  message: string
): Promise<EncryptedPayload> {
  // Generate ephemeral X25519 keypair for this message
  const ephemeral = generateX25519KeyPair();

  // Compute shared secret using ECDH
  const sharedSecretHex = x25519SharedSecret(
    ephemeral.privateKey,
    recipientX25519PubkeyHex
  );
  const sharedSecret = hexToBytes(sharedSecretHex);

  // Derive AES-GCM key from shared secret
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret);

  // Generate random 12-byte nonce for AES-GCM
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt message
  const messageBytes = stringToBytes(message);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    aesKey,
    toArrayBuffer(messageBytes)
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    nonce: bytesToHex(nonce),
    ephemeralPublicKey: ephemeral.publicKey,
  };
}

/**
 * Decrypt a message using X25519 ECDH + AES-GCM.
 *
 * @param ourX25519PrivateKeyHex - Our X25519 private key (hex-encoded)
 * @param ciphertextHex - Encrypted message (hex-encoded)
 * @param nonceHex - Encryption nonce (hex-encoded, 12 bytes)
 * @param ephemeralPubkeyHex - Sender's ephemeral X25519 public key (hex-encoded)
 * @returns Decrypted message (UTF-8 string)
 */
export async function decryptMessage(
  ourX25519PrivateKeyHex: string,
  ciphertextHex: string,
  nonceHex: string,
  ephemeralPubkeyHex: string
): Promise<string> {
  // Compute shared secret using ECDH with ephemeral public key
  const sharedSecretHex = x25519SharedSecret(
    ourX25519PrivateKeyHex,
    ephemeralPubkeyHex
  );
  const sharedSecret = hexToBytes(sharedSecretHex);

  // Derive AES-GCM key from shared secret
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret);

  // Decrypt
  const ciphertext = hexToBytes(ciphertextHex);
  const nonce = hexToBytes(nonceHex);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    aesKey,
    toArrayBuffer(ciphertext)
  );

  return bytesToString(new Uint8Array(plaintextBuffer));
}

// =============================================================================
// Ed25519 to X25519 Conversion (PRODUCTION-READY)
// =============================================================================

/**
 * Convert an Ed25519 public key to X25519 format.
 *
 * Ed25519 (twisted Edwards curve) and X25519 (Montgomery curve) use the same
 * underlying Curve25519. This function performs the birational map to convert
 * an Ed25519 public key to X25519 format, allowing a single keypair to be
 * used for both authentication (signing) and encryption (ECDH).
 *
 * Uses @noble/curves ed25519.utils.toMontgomery() for the conversion.
 *
 * NOTE: There is NO reverse conversion (X25519 -> Ed25519) because:
 * - There are 2 valid Ed25519 points for every X25519 point (sign ambiguity)
 * - X25519 accepts some points on the quadratic twist that have no Ed25519 equivalent
 *
 * @param ed25519PubkeyHex - Ed25519 public key (32 bytes, hex)
 * @returns X25519 public key (32 bytes, hex)
 */
export function ed25519ToX25519PublicKey(ed25519PubkeyHex: string): string {
  const ed25519Pubkey = hexToBytes(ed25519PubkeyHex);
  const x25519Pubkey = ed25519.utils.toMontgomery(ed25519Pubkey);
  return bytesToHex(x25519Pubkey);
}

/**
 * Convert an Ed25519 private key to X25519 format.
 *
 * This allows using the same seed/private key for both Ed25519 signing
 * and X25519 ECDH key exchange.
 *
 * Uses @noble/curves ed25519.utils.toMontgomerySecret() for the conversion.
 *
 * @param ed25519PrivkeyHex - Ed25519 private key (32 bytes, hex)
 * @returns X25519 private key (32 bytes, hex)
 */
export function ed25519ToX25519PrivateKey(ed25519PrivkeyHex: string): string {
  const ed25519Privkey = hexToBytes(ed25519PrivkeyHex);
  const x25519Privkey = ed25519.utils.toMontgomerySecret(ed25519Privkey);
  return bytesToHex(x25519Privkey);
}

/**
 * Generate a unified keypair that works for both Ed25519 signing and X25519 encryption.
 *
 * This generates an Ed25519 keypair and also computes the corresponding X25519 keys,
 * allowing a single identity to be used for both authentication and E2E encryption.
 *
 * @returns Object with Ed25519 keys (for signing) and X25519 keys (for encryption)
 */
export async function generateUnifiedKeyPair(): Promise<{
  ed25519: Ed25519KeyPair;
  x25519: X25519KeyPair;
}> {
  // Generate Ed25519 keypair
  const ed25519Keys = await generateAuthKeyPair();

  // Convert to X25519 for encryption
  const x25519PubKey = ed25519ToX25519PublicKey(ed25519Keys.publicKey);
  const x25519PrivKey = ed25519ToX25519PrivateKey(ed25519Keys.privateKey);

  return {
    ed25519: ed25519Keys,
    x25519: {
      publicKey: x25519PubKey,
      privateKey: x25519PrivKey,
    },
  };
}

// =============================================================================
// Password-Based Key Derivation (for local key storage)
// =============================================================================

/**
 * Derive an encryption key from a password using PBKDF2.
 *
 * Uses 100,000 iterations of PBKDF2 with SHA-256, which provides good
 * protection against brute-force attacks while remaining fast enough
 * for interactive use.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const passwordBytes = stringToBytes(password);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(passwordBytes),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with a password.
 *
 * Uses PBKDF2 to derive an AES-GCM key from the password,
 * then encrypts the data. Salt and nonce are generated randomly
 * and must be stored alongside the ciphertext.
 */
export async function encryptWithPassword(
  data: string,
  password: string
): Promise<{ ciphertext: string; salt: string; nonce: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);

  const dataBytes = stringToBytes(data);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    key,
    toArrayBuffer(dataBytes)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt data with a password.
 *
 * Derives the same AES-GCM key from password + salt, then decrypts.
 * Throws if password is wrong or data is corrupted.
 */
export async function decryptWithPassword(
  ciphertextBase64: string,
  saltBase64: string,
  nonceBase64: string,
  password: string
): Promise<string> {
  const ciphertext = base64ToBytes(ciphertextBase64);
  const salt = base64ToBytes(saltBase64);
  const nonce = base64ToBytes(nonceBase64);

  const key = await deriveKeyFromPassword(password, salt);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    key,
    toArrayBuffer(ciphertext)
  );

  return bytesToString(new Uint8Array(plaintextBuffer));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a random hex string of specified byte length.
 */
export function generateRandomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(bytes);
}

/**
 * Securely compare two hex strings in constant time.
 *
 * This prevents timing attacks when comparing secret values like signatures.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const aBytes = hexToBytes(a);
  const bBytes = hexToBytes(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}
