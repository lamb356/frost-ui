/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const init: () => void;
export const generate_key_shares: (a: number, b: number) => [number, number];
export const generate_round1_commitment: (a: number, b: number) => [number, number];
export const generate_round2_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
export const aggregate_signature: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
export const verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_start: () => void;
