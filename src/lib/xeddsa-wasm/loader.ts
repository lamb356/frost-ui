/**
 * XEdDSA WASM Loader
 *
 * Dynamically loads the XEdDSA WASM module compiled from Rust's xeddsa 1.0.2 crate.
 * This provides byte-for-byte compatibility with frostd's authentication.
 */

// Type definitions for the WASM module
export interface XEdDSAKeypair {
  private_key: Uint8Array;
  public_key: Uint8Array;
}

export interface XEdDSAWasm {
  generate_keypair(): XEdDSAKeypair;
  get_public_key(privateKey: Uint8Array): Uint8Array;
  sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array;
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
}

// Singleton instance
let wasmModule: XEdDSAWasm | null = null;
let loadPromise: Promise<XEdDSAWasm> | null = null;

/**
 * Load the XEdDSA WASM module.
 * Returns a cached instance if already loaded.
 */
export async function loadXEdDSA(): Promise<XEdDSAWasm> {
  // Return cached module if available
  if (wasmModule) {
    return wasmModule;
  }

  // Return existing load promise if loading
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading
  loadPromise = (async () => {
    try {
      // Dynamic import of the WASM package
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wasm = (await import('./pkg/xeddsa_wasm.js')) as any;

      // For --target web builds, there's a default init function
      // For --target nodejs builds, functions are directly available
      if (typeof wasm.default === 'function') {
        await wasm.default();
      }

      // Create the module interface
      wasmModule = {
        generate_keypair: () => {
          const keypair = wasm.generate_keypair();
          return {
            private_key: new Uint8Array(keypair.private_key),
            public_key: new Uint8Array(keypair.public_key),
          };
        },
        get_public_key: (privateKey: Uint8Array) => {
          return new Uint8Array(wasm.get_public_key(privateKey));
        },
        sign: (privateKey: Uint8Array, message: Uint8Array) => {
          return new Uint8Array(wasm.sign(privateKey, message));
        },
        verify: (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => {
          return wasm.verify(publicKey, message, signature);
        },
      };

      return wasmModule;
    } catch (error) {
      loadPromise = null;
      throw new Error(`Failed to load XEdDSA WASM: ${error}`);
    }
  })();

  return loadPromise;
}

/**
 * Check if WASM module is loaded.
 */
export function isXEdDSALoaded(): boolean {
  return wasmModule !== null;
}

/**
 * Get the loaded WASM module synchronously.
 * Throws if not loaded yet.
 */
export function getXEdDSA(): XEdDSAWasm {
  if (!wasmModule) {
    throw new Error('XEdDSA WASM not loaded. Call loadXEdDSA() first.');
  }
  return wasmModule;
}

// Utility functions for hex encoding/decoding
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
 * Convert UUID string to 16-byte binary representation.
 * frostd uses Rust's Uuid::as_bytes() which returns the 16-byte binary form,
 * NOT the 36-character string form.
 *
 * @param uuid - UUID string like "b324f3f9-4a23-477d-9883-2b12d9d42b94"
 * @returns 16-byte Uint8Array
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: expected 32 hex chars, got ${hex.length}`);
  }
  return hexToBytes(hex);
}

/**
 * High-level signing function for frostd authentication.
 *
 * IMPORTANT: Signs the 16-byte binary UUID, NOT the 36-byte string!
 * frostd uses Rust's Uuid::as_bytes() for verification.
 *
 * @param privateKeyHex - 32-byte X25519 private key (hex-encoded)
 * @param challenge - UUID challenge string from frostd
 * @returns Hex-encoded 64-byte XEdDSA signature
 */
export async function signChallengeWasm(
  privateKeyHex: string,
  challenge: string
): Promise<string> {
  const wasm = await loadXEdDSA();
  const privateKey = hexToBytes(privateKeyHex);
  // CRITICAL: Sign the 16-byte binary UUID, NOT the 36-byte string!
  const messageBytes = uuidToBytes(challenge);
  const signature = wasm.sign(privateKey, messageBytes);
  return bytesToHex(signature);
}

/**
 * High-level keypair generation for frostd authentication.
 *
 * @returns Object with hex-encoded privateKey and publicKey
 */
export async function generateAuthKeyPairWasm(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const wasm = await loadXEdDSA();
  const keypair = wasm.generate_keypair();
  return {
    privateKey: bytesToHex(keypair.private_key),
    publicKey: bytesToHex(keypair.public_key),
  };
}

/**
 * High-level verification function.
 *
 * IMPORTANT: Verifies against the 16-byte binary UUID, NOT the 36-byte string!
 * frostd uses Rust's Uuid::as_bytes() for verification.
 *
 * @param publicKeyHex - 32-byte X25519 public key (hex-encoded)
 * @param challenge - Original challenge string (UUID format)
 * @param signatureHex - 64-byte XEdDSA signature (hex-encoded)
 * @returns true if signature is valid
 */
export async function verifyChallengeWasm(
  publicKeyHex: string,
  challenge: string,
  signatureHex: string
): Promise<boolean> {
  const wasm = await loadXEdDSA();
  const publicKey = hexToBytes(publicKeyHex);
  // CRITICAL: Verify against the 16-byte binary UUID, NOT the 36-byte string!
  const messageBytes = uuidToBytes(challenge);
  const signature = hexToBytes(signatureHex);
  return wasm.verify(publicKey, messageBytes, signature);
}
