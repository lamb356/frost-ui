/* tslint:disable */
/* eslint-disable */

/**
 * Aggregate signature shares into final signature.
 *
 * # Arguments
 * * `shares_json` - JSON array of SignatureShare objects
 * * `commitments_json` - JSON array of Commitment objects
 * * `message_hex` - Message that was signed (hex-encoded)
 * * `public_key_package_json` - Serialized PublicKeyPackage (JSON, from KeyGenResult)
 *
 * # Returns
 * JSON string containing AggregateSignature or FrostError
 */
export function aggregate_signature(shares_json: string, commitments_json: string, message_hex: string, public_key_package_json: string): string;

/**
 * Generate key shares using trusted dealer key generation.
 *
 * # Arguments
 * * `threshold` - Minimum number of signers required (t)
 * * `total` - Total number of participants (n)
 *
 * # Returns
 * JSON string containing KeyGenResult or FrostError
 */
export function generate_key_shares(threshold: number, total: number): string;

/**
 * Generate Round 1 commitment and nonces.
 *
 * # Arguments
 * * `key_package_json` - The participant's key package (JSON, from KeyGenResult)
 *
 * # Returns
 * JSON string containing Round1Result or FrostError
 */
export function generate_round1_commitment(key_package_json: string): string;

/**
 * Generate Round 2 signature share.
 *
 * # Arguments
 * * `key_package_json` - The participant's key package (JSON)
 * * `nonces_json` - The participant's SigningNonces (JSON from Round1)
 * * `commitments_json` - JSON array of all participants' Commitment objects
 * * `message_hex` - Message to sign (hex-encoded)
 *
 * # Returns
 * JSON string containing SignatureShare or FrostError
 */
export function generate_round2_signature(key_package_json: string, nonces_json: string, commitments_json: string, message_hex: string): string;

export function init(): void;

/**
 * Verify a signature.
 *
 * # Arguments
 * * `signature_hex` - The aggregate signature (hex-encoded)
 * * `message_hex` - The message that was signed (hex-encoded)
 * * `group_public_key_hex` - The group public key (hex-encoded)
 *
 * # Returns
 * JSON string containing { "valid": bool } or FrostError
 */
export function verify_signature(signature_hex: string, message_hex: string, group_public_key_hex: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly init: () => void;
  readonly generate_key_shares: (a: number, b: number) => [number, number];
  readonly generate_round1_commitment: (a: number, b: number) => [number, number];
  readonly generate_round2_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly aggregate_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
