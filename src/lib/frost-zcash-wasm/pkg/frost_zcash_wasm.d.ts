/* tslint:disable */
/* eslint-disable */

/**
 * Aggregate signature shares into final signature
 *
 * # Arguments
 * * `shares_json` - All signature shares (JSON array)
 * * `signing_package_json` - Signing package (JSON)
 * * `public_key_package_json` - Public key package (JSON)
 * * `randomizer_json` - Randomizer used for signing (JSON)
 *
 * # Returns
 * JSON string containing AggregateResult or FrostError
 */
export function aggregate_signature(shares_json: string, signing_package_json: string, public_key_package_json: string, randomizer_json: string): string;

/**
 * Create a signing package with randomizer for rerandomized FROST
 *
 * This should be called by the coordinator after collecting all commitments.
 * The randomizer is generated from the signing package and must be distributed
 * to all signers via a secure channel.
 *
 * # Arguments
 * * `commitments_json` - All participants' commitments (JSON array)
 * * `message_hex` - Message to sign (hex-encoded)
 * * `public_key_package_json` - Public key package (JSON)
 *
 * # Returns
 * JSON string containing SigningPackageResult or FrostError
 */
export function create_signing_package(commitments_json: string, message_hex: string, public_key_package_json: string): string;

/**
 * Generate FROST key shares using trusted dealer
 *
 * # Arguments
 * * `threshold` - Minimum signers required (t)
 * * `total` - Total number of signers (n)
 *
 * # Returns
 * JSON string containing KeyGenResult or FrostError
 */
export function generate_key_shares(threshold: number, total: number): string;

/**
 * Generate Round 1 commitment for signing
 *
 * # Arguments
 * * `key_package_json` - Participant's key package (JSON)
 *
 * # Returns
 * JSON string containing Round1Result or FrostError
 */
export function generate_round1_commitment(key_package_json: string): string;

/**
 * Generate Round 2 signature share using rerandomization
 *
 * # Arguments
 * * `key_package_json` - Participant's key package (JSON)
 * * `nonces_json` - Participant's nonces from Round 1 (JSON)
 * * `signing_package_json` - Signing package from coordinator (JSON)
 * * `randomizer_json` - Randomizer from coordinator (JSON)
 *
 * # Returns
 * JSON string containing SignatureShareInfo or FrostError
 */
export function generate_round2_signature(key_package_json: string, nonces_json: string, signing_package_json: string, randomizer_json: string): string;

/**
 * Get the group public key from a public key package
 *
 * # Arguments
 * * `public_key_package_json` - Public key package (JSON)
 *
 * # Returns
 * Hex-encoded group public key or error
 */
export function get_group_public_key(public_key_package_json: string): string;

/**
 * Get the public key from a key package
 *
 * # Arguments
 * * `key_package_json` - Key package (JSON)
 *
 * # Returns
 * JSON string with public key (hex) or FrostError
 */
export function get_public_key(key_package_json: string): string;

/**
 * Initialize panic hook for better error messages in WASM
 */
export function init(): void;

/**
 * Verify a rerandomized signature
 *
 * # Arguments
 * * `signature_hex` - Signature to verify (hex-encoded)
 * * `message_hex` - Message that was signed (hex-encoded)
 * * `group_public_key_hex` - Group verifying key (hex-encoded)
 * * `randomizer_json` - Randomizer used for signing (JSON)
 *
 * # Returns
 * JSON string containing verification result or FrostError
 */
export function verify_signature(signature_hex: string, message_hex: string, group_public_key_hex: string, randomizer_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly init: () => void;
  readonly generate_key_shares: (a: number, b: number) => [number, number];
  readonly generate_round1_commitment: (a: number, b: number) => [number, number];
  readonly create_signing_package: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly generate_round2_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly aggregate_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
  readonly get_public_key: (a: number, b: number) => [number, number];
  readonly get_group_public_key: (a: number, b: number) => [number, number];
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
