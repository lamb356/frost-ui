/**
 * FROST Backend Factory
 *
 * Provides a unified interface for FROST threshold signatures across
 * different curve implementations (Ed25519, RedPallas).
 */

export type { BackendId, FrostBackend, KeyGenResult, Round1Result, SigningPackageResult } from './types';
export { supportsRerandomization, hasCreateSigningPackage } from './types';

import type { BackendId, FrostBackend } from './types';

// Lazy-loaded backend instances
const backends: Partial<Record<BackendId, FrostBackend>> = {};

/**
 * Get a FROST backend by ID.
 *
 * Backends are lazy-loaded - the WASM module is only loaded when first requested.
 *
 * @param backendId The backend to load
 * @returns The loaded backend
 * @throws If the backend fails to load
 *
 * @example
 * ```typescript
 * // Get Ed25519 backend (standard FROST)
 * const ed25519 = await getBackend('ed25519');
 *
 * // Get Orchard backend (Zcash, rerandomized FROST)
 * const orchard = await getBackend('orchard-redpallas');
 * ```
 */
export async function getBackend(backendId: BackendId): Promise<FrostBackend> {
  // Return cached instance if available
  if (backends[backendId]) {
    return backends[backendId]!;
  }

  // Lazy-load the appropriate backend
  switch (backendId) {
    case 'ed25519': {
      const { getEd25519Backend } = await import('./ed25519');
      const backend = await getEd25519Backend();
      backends[backendId] = backend;
      return backend;
    }

    case 'orchard-redpallas': {
      const { getOrchardBackend } = await import('./orchard');
      const backend = await getOrchardBackend();
      backends[backendId] = backend;
      return backend;
    }

    default:
      throw new Error(`Unknown backend: ${backendId}`);
  }
}

/**
 * Check if a backend is already loaded.
 */
export function isBackendLoaded(backendId: BackendId): boolean {
  return backendId in backends;
}

/**
 * Get all supported backend IDs.
 */
export function getSupportedBackends(): BackendId[] {
  return ['ed25519', 'orchard-redpallas'];
}

/**
 * Get human-readable name for a backend.
 */
export function getBackendName(backendId: BackendId): string {
  switch (backendId) {
    case 'ed25519':
      return 'Ed25519 (Standard FROST)';
    case 'orchard-redpallas':
      return 'Zcash Orchard (RedPallas)';
    default:
      return backendId;
  }
}

/**
 * Get description for a backend.
 */
export function getBackendDescription(backendId: BackendId): string {
  switch (backendId) {
    case 'ed25519':
      return 'Standard FROST threshold signatures using the Ed25519 curve. Compatible with Ed25519 ecosystem.';
    case 'orchard-redpallas':
      return 'Rerandomized FROST for Zcash Orchard using the RedPallas curve. Provides transaction unlinkability.';
    default:
      return '';
  }
}
