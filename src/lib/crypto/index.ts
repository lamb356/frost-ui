/**
 * Crypto Utilities for FROST Multi-Sig UI
 *
 * Provides WebCrypto-based utilities for:
 * - Ed25519 key generation (via P-256 as fallback since Ed25519 isn't widely supported)
 * - Challenge signing for frostd authentication
 * - E2E message encryption using ECDH + AES-GCM
 */

// =============================================================================
// Types
// =============================================================================

export interface KeyPair {
  publicKey: string; // Hex-encoded
  privateKey: string; // Hex-encoded
}

export interface EncryptedPayload {
  ciphertext: string; // Base64-encoded
  nonce: string; // Base64-encoded
  ephemeralPublicKey: string; // Hex-encoded (for ECDH)
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
// Key Generation
// =============================================================================

/**
 * Generate a new authentication key pair.
 * Uses ECDSA P-256 as it's widely supported in WebCrypto.
 * (Ed25519 would be ideal but has limited browser support)
 */
export async function generateAuthKeyPair(): Promise<KeyPair> {
  // Generate ECDSA key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  // Export public key as raw bytes
  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyHex = bytesToHex(new Uint8Array(publicKeyBuffer));

  // Export private key as PKCS8
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyHex = bytesToHex(new Uint8Array(privateKeyBuffer));

  return {
    publicKey: publicKeyHex,
    privateKey: privateKeyHex,
  };
}

/**
 * Import a private key from hex for signing.
 */
export async function importSigningKey(privateKeyHex: string): Promise<CryptoKey> {
  const privateKeyBytes = hexToBytes(privateKeyHex);

  return crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes.buffer as ArrayBuffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false, // not extractable
    ['sign']
  );
}

/**
 * Import a public key from hex for verification.
 */
export async function importVerifyingKey(publicKeyHex: string): Promise<CryptoKey> {
  const publicKeyBytes = hexToBytes(publicKeyHex);

  return crypto.subtle.importKey(
    'raw',
    publicKeyBytes.buffer as ArrayBuffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false, // not extractable
    ['verify']
  );
}

// =============================================================================
// Signing
// =============================================================================

/**
 * Sign a challenge from frostd for authentication.
 */
export async function signChallenge(
  privateKeyHex: string,
  challenge: string
): Promise<string> {
  // Import the private key
  const privateKey = await importSigningKey(privateKeyHex);

  // Convert challenge to bytes (it's hex-encoded from server)
  const challengeBytes = hexToBytes(challenge);

  // Sign the challenge
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    challengeBytes.buffer as ArrayBuffer
  );

  // Return signature as hex
  return bytesToHex(new Uint8Array(signatureBuffer));
}

/**
 * Verify a signature.
 */
export async function verifySignature(
  publicKeyHex: string,
  message: string,
  signatureHex: string
): Promise<boolean> {
  try {
    const publicKey = await importVerifyingKey(publicKeyHex);
    const messageBytes = hexToBytes(message);
    const signatureBytes = hexToBytes(signatureHex);

    return crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signatureBytes.buffer as ArrayBuffer,
      messageBytes.buffer as ArrayBuffer
    );
  } catch {
    return false;
  }
}

// =============================================================================
// ECDH Key Exchange for E2E Encryption
// =============================================================================

/**
 * Generate an ephemeral ECDH key pair for message encryption.
 */
async function generateEphemeralKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyHex: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveBits']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyHex = bytesToHex(new Uint8Array(publicKeyBuffer));

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyHex,
  };
}

/**
 * Import a public key for ECDH key exchange.
 */
async function importECDHPublicKey(publicKeyHex: string): Promise<CryptoKey> {
  const publicKeyBytes = hexToBytes(publicKeyHex);

  return crypto.subtle.importKey(
    'raw',
    publicKeyBytes.buffer as ArrayBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    []
  );
}

/**
 * Derive a shared secret using ECDH.
 */
async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  // Derive shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    256 // 256 bits = 32 bytes
  );

  // Import as AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    sharedBits,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

// =============================================================================
// E2E Encryption
// =============================================================================

/**
 * Encrypt a message for a specific recipient using their public key.
 * Uses ECDH key agreement + AES-GCM encryption.
 */
export async function encryptMessage(
  recipientPubkeyHex: string,
  message: string
): Promise<EncryptedPayload> {
  // Generate ephemeral key pair for this message
  const ephemeral = await generateEphemeralKeyPair();

  // Import recipient's public key
  const recipientPublicKey = await importECDHPublicKey(recipientPubkeyHex);

  // Derive shared secret
  const sharedKey = await deriveSharedKey(ephemeral.privateKey, recipientPublicKey);

  // Generate random nonce (96 bits for AES-GCM)
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the message
  const messageBytes = stringToBytes(message);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce.buffer as ArrayBuffer,
      tagLength: 128, // 128-bit auth tag
    },
    sharedKey,
    messageBytes.buffer as ArrayBuffer
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    nonce: bytesToBase64(nonce),
    ephemeralPublicKey: ephemeral.publicKeyHex,
  };
}

/**
 * Decrypt a message using our private key and the sender's ephemeral public key.
 */
export async function decryptMessage(
  ephemeralPubkeyHex: string,
  ciphertextBase64: string,
  nonceBase64: string,
  ourPrivateKeyHex: string
): Promise<string> {
  // Import our private key for ECDH
  const ourPrivateKeyBytes = hexToBytes(ourPrivateKeyHex);
  const ourPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    ourPrivateKeyBytes.buffer as ArrayBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveBits']
  );

  // Import sender's ephemeral public key
  const ephemeralPublicKey = await importECDHPublicKey(ephemeralPubkeyHex);

  // Derive shared secret
  const sharedKey = await deriveSharedKey(ourPrivateKey, ephemeralPublicKey);

  // Decode ciphertext and nonce
  const ciphertext = base64ToBytes(ciphertextBase64);
  const nonce = base64ToBytes(nonceBase64);

  // Decrypt
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce.buffer as ArrayBuffer,
      tagLength: 128,
    },
    sharedKey,
    ciphertext.buffer as ArrayBuffer
  );

  return bytesToString(new Uint8Array(plaintextBuffer));
}

// =============================================================================
// Password-Based Key Derivation
// =============================================================================

/**
 * Derive an encryption key from a password using PBKDF2.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Import password as key material
  const passwordBytes = stringToBytes(password);
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000, // High iteration count for security
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
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
  // Generate random salt and nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Derive key from password
  const key = await deriveKeyFromPassword(password, salt);

  // Encrypt data
  const dataBytes = stringToBytes(data);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce.buffer as ArrayBuffer,
      tagLength: 128,
    },
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
  // Decode inputs
  const ciphertext = base64ToBytes(ciphertextBase64);
  const salt = base64ToBytes(saltBase64);
  const nonce = base64ToBytes(nonceBase64);

  // Derive key from password
  const key = await deriveKeyFromPassword(password, salt);

  // Decrypt
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce.buffer as ArrayBuffer,
      tagLength: 128,
    },
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
