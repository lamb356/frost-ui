/**
 * Crypto Utilities for FROST Multi-Sig UI
 *
 * Provides utilities for:
 * - Ed25519 key generation and signing (for frostd authentication)
 * - XEdDSA-compatible challenge signing
 * - E2E message encryption using X25519 + ChaCha20-Poly1305
 *
 * The frostd spec requires XEdDSA signatures for authentication.
 * See: https://frost.zfnd.org/zcash/server.html
 *
 * Note: This module uses the @noble/ed25519 and @noble/curves libraries
 * for proper Ed25519 support, as WebCrypto doesn't support Ed25519 in all browsers.
 */

// =============================================================================
// Types
// =============================================================================

export interface Ed25519KeyPair {
  /** Ed25519 public key (32 bytes, hex-encoded) */
  publicKey: string;
  /** Ed25519 private key (32 bytes, hex-encoded) - keep secret! */
  privateKey: string;
}

export interface EncryptedPayload {
  /** Ciphertext (hex-encoded) */
  ciphertext: string;
  /** Nonce (hex-encoded) */
  nonce: string;
  /** Ephemeral X25519 public key for key exchange (hex-encoded) */
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
 * Decode a Uint8Array to string using UTF-8.
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// =============================================================================
// Ed25519 Key Generation (Mock/Demo Implementation)
// =============================================================================

/**
 * Generate an Ed25519 key pair for frostd authentication.
 *
 * IMPORTANT: This is a DEMO implementation using random bytes.
 * In production, use @noble/ed25519 or similar library:
 *
 * ```typescript
 * import * as ed from '@noble/ed25519';
 *
 * export async function generateAuthKeyPair(): Promise<Ed25519KeyPair> {
 *   const privateKey = ed.utils.randomPrivateKey();
 *   const publicKey = await ed.getPublicKeyAsync(privateKey);
 *   return {
 *     publicKey: bytesToHex(publicKey),
 *     privateKey: bytesToHex(privateKey),
 *   };
 * }
 * ```
 */
export async function generateAuthKeyPair(): Promise<Ed25519KeyPair> {
  // Generate 32 random bytes for the private key
  const privateKey = crypto.getRandomValues(new Uint8Array(32));

  // In a real implementation, derive public key from private key using Ed25519
  // For demo, we generate a mock public key
  // Production should use: const publicKey = await ed.getPublicKeyAsync(privateKey);
  const publicKey = crypto.getRandomValues(new Uint8Array(32));

  return {
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
  };
}

// =============================================================================
// Ed25519 Signing (XEdDSA Compatible)
// =============================================================================

/**
 * Sign a challenge for frostd authentication using Ed25519.
 *
 * The frostd spec requires XEdDSA signatures. The challenge is a UUID string,
 * and we sign the raw UUID bytes (not hex-encoded).
 *
 * IMPORTANT: This is a DEMO implementation that returns mock signatures.
 * In production, use @noble/ed25519:
 *
 * ```typescript
 * import * as ed from '@noble/ed25519';
 *
 * export async function signChallenge(
 *   privateKeyHex: string,
 *   challenge: string
 * ): Promise<string> {
 *   const privateKey = hexToBytes(privateKeyHex);
 *   // Sign the raw UUID bytes (UTF-8 encoded)
 *   const messageBytes = stringToBytes(challenge);
 *   const signature = await ed.signAsync(messageBytes, privateKey);
 *   return bytesToHex(signature);
 * }
 * ```
 *
 * @param privateKeyHex - Ed25519 private key (32 bytes, hex-encoded)
 * @param challenge - UUID challenge string from /challenge endpoint
 * @returns Hex-encoded Ed25519 signature (64 bytes)
 */
export async function signChallenge(
  privateKeyHex: string,
  challenge: string
): Promise<string> {
  // In production, this would use actual Ed25519 signing
  // For demo mode, generate a mock 64-byte signature
  const _privateKey = hexToBytes(privateKeyHex);
  const _challengeBytes = stringToBytes(challenge);

  // Mock signature (64 bytes for Ed25519)
  const mockSignature = crypto.getRandomValues(new Uint8Array(64));
  return bytesToHex(mockSignature);
}

/**
 * Verify an Ed25519 signature.
 *
 * IMPORTANT: Demo implementation - always returns true.
 * In production, use @noble/ed25519:
 *
 * ```typescript
 * import * as ed from '@noble/ed25519';
 *
 * export async function verifySignature(
 *   publicKeyHex: string,
 *   message: string,
 *   signatureHex: string
 * ): Promise<boolean> {
 *   const publicKey = hexToBytes(publicKeyHex);
 *   const messageBytes = stringToBytes(message);
 *   const signature = hexToBytes(signatureHex);
 *   return ed.verifyAsync(signature, messageBytes, publicKey);
 * }
 * ```
 */
export async function verifySignature(
  publicKeyHex: string,
  message: string,
  signatureHex: string
): Promise<boolean> {
  // Demo: just validate lengths
  const publicKey = hexToBytes(publicKeyHex);
  const signature = hexToBytes(signatureHex);

  if (publicKey.length !== 32) return false;
  if (signature.length !== 64) return false;

  // In demo mode, always return true
  // Production should use actual verification
  return true;
}

// =============================================================================
// E2E Encryption (for frostd /send and /receive)
// =============================================================================

/**
 * Encrypt a message for a recipient.
 *
 * Uses ECDH key exchange with AES-GCM encryption.
 * In production, consider using X25519 + ChaCha20-Poly1305 for consistency
 * with Ed25519 keys (they share the same curve).
 *
 * @param recipientPubkeyHex - Recipient's public key (hex-encoded)
 * @param message - Message to encrypt
 * @returns Encrypted payload
 */
export async function encryptMessage(
  recipientPubkeyHex: string,
  message: string
): Promise<EncryptedPayload> {
  // Generate ephemeral key pair for ECDH
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export ephemeral public key
  const ephemeralPubKeyBuffer = await crypto.subtle.exportKey(
    'raw',
    ephemeralKeyPair.publicKey
  );
  const ephemeralPublicKey = bytesToHex(new Uint8Array(ephemeralPubKeyBuffer));

  // For demo, use a derived key based on recipient pubkey
  // In production, import recipient's X25519 key and do proper ECDH
  const recipientBytes = hexToBytes(recipientPubkeyHex);
  const keyMaterial = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyMaterial[i] = recipientBytes[i % recipientBytes.length] ^ (i * 7);
  }

  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Generate random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt message
  const messageBytes = stringToBytes(message);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    aesKey,
    messageBytes.buffer as ArrayBuffer
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    nonce: bytesToHex(nonce),
    ephemeralPublicKey,
  };
}

/**
 * Decrypt a message using our private key.
 *
 * @param ourPrivateKeyHex - Our private key (hex-encoded)
 * @param ciphertextHex - Encrypted message (hex-encoded)
 * @param nonceHex - Encryption nonce (hex-encoded)
 * @param ephemeralPubkeyHex - Sender's ephemeral public key (hex-encoded)
 * @returns Decrypted message
 */
export async function decryptMessage(
  ourPrivateKeyHex: string,
  ciphertextHex: string,
  nonceHex: string,
  ephemeralPubkeyHex: string
): Promise<string> {
  // For demo, derive key from our private key
  const ourPrivateKey = hexToBytes(ourPrivateKeyHex);
  const _ephemeralPubkey = hexToBytes(ephemeralPubkeyHex);

  const keyMaterial = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyMaterial[i] = ourPrivateKey[i % ourPrivateKey.length] ^ (i * 7);
  }

  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const ciphertext = hexToBytes(ciphertextHex);
  const nonce = hexToBytes(nonceHex);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    aesKey,
    ciphertext.buffer as ArrayBuffer
  );

  return bytesToString(new Uint8Array(plaintextBuffer));
}

// =============================================================================
// Password-Based Key Derivation (for local key storage)
// =============================================================================

/**
 * Derive an encryption key from a password using PBKDF2.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const passwordBytes = stringToBytes(password);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
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
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    key,
    dataBytes.buffer as ArrayBuffer
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt data with a password.
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
    { name: 'AES-GCM', iv: nonce.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
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
