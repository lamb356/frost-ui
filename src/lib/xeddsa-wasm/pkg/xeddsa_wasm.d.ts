/* tslint:disable */
/* eslint-disable */

export class Keypair {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly private_key: Uint8Array;
  readonly public_key: Uint8Array;
}

/**
 * Generate a new X25519 keypair for XEdDSA signing.
 * Returns a Keypair with 32-byte private_key and 32-byte public_key.
 */
export function generate_keypair(): Keypair;

/**
 * Get the X25519 public key from a private key.
 *
 * # Arguments
 * * `private_key` - 32-byte X25519 private key
 *
 * # Returns
 * 32-byte X25519 public key
 */
export function get_public_key(private_key: Uint8Array): Uint8Array;

/**
 * Sign a message using XEdDSA with an X25519 private key.
 * This uses the exact same algorithm as frostd for authentication.
 *
 * # Arguments
 * * `private_key` - 32-byte X25519 private key
 * * `message` - Message bytes to sign
 *
 * # Returns
 * 64-byte XEdDSA signature
 */
export function sign(private_key: Uint8Array, message: Uint8Array): Uint8Array;

/**
 * Verify an XEdDSA signature using an X25519 public key.
 * This uses the exact same algorithm as frostd for authentication.
 *
 * # Arguments
 * * `public_key` - 32-byte X25519 public key
 * * `message` - Original message bytes
 * * `signature` - 64-byte XEdDSA signature
 *
 * # Returns
 * true if signature is valid, false otherwise
 */
export function verify(public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_keypair_free: (a: number, b: number) => void;
  readonly keypair_private_key: (a: number) => [number, number];
  readonly keypair_public_key: (a: number) => [number, number];
  readonly generate_keypair: () => number;
  readonly get_public_key: (a: number, b: number) => [number, number, number, number];
  readonly sign: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
