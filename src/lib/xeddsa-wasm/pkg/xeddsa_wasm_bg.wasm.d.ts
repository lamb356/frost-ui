/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_keypair_free: (a: number, b: number) => void;
export const generate_keypair: () => number;
export const get_public_key: (a: number, b: number) => [number, number, number, number];
export const keypair_private_key: (a: number) => [number, number];
export const keypair_public_key: (a: number) => [number, number];
export const sign: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
