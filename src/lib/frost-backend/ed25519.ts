/**
 * Ed25519 FROST Backend
 *
 * Implements the FrostBackend interface using frost-ed25519 WASM.
 * Standard FROST without rerandomization.
 */

import type { FrostBackend, KeyGenResult, Round1Result } from './types';
import * as frostWasm from '../frost-wasm/loader';

/**
 * Ed25519 FROST backend implementation.
 */
class Ed25519Backend implements FrostBackend {
  readonly backendId = 'ed25519' as const;

  async generateKeyShares(threshold: number, total: number): Promise<KeyGenResult> {
    const result = await frostWasm.generateKeyShares(threshold, total);

    return {
      groupPublicKey: result.group_public_key,
      shares: result.shares.map((share) => ({
        identifier: share.identifier,
        // For Ed25519, we store the signing_share as the keyPackage
        // The verifying_share is public and not needed for signing
        keyPackage: JSON.stringify({
          identifier: share.identifier,
          signing_share: share.signing_share,
          verifying_share: share.verifying_share,
        }),
      })),
      // Ed25519 doesn't have a separate public key package
      // We use the group_public_key for verification
      publicKeyPackage: JSON.stringify({
        group_public_key: result.group_public_key,
        threshold: result.threshold,
        total: result.total,
      }),
      threshold: result.threshold,
      total: result.total,
    };
  }

  async generateRound1(keyPackage: string): Promise<Round1Result> {
    const pkg = JSON.parse(keyPackage) as {
      identifier: number;
      signing_share: string;
    };

    const result = await frostWasm.generateRound1Commitment(pkg.signing_share, pkg.identifier);

    return {
      nonces: JSON.stringify(result.nonces),
      commitment: JSON.stringify(result.commitment),
      identifier: pkg.identifier,
    };
  }

  async generateRound2(
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    _randomizer?: string // Ignored for Ed25519
  ): Promise<string> {
    const pkg = JSON.parse(keyPackage) as {
      identifier: number;
      signing_share: string;
    };

    const sigPkg = JSON.parse(signingPackage) as {
      message: string;
      commitments: Array<{ identifier: number; hiding: string; binding: string }>;
    };

    const noncesObj = JSON.parse(nonces) as {
      identifier: number;
      hiding: string;
      binding: string;
    };

    const result = await frostWasm.generateRound2Signature(
      pkg.signing_share,
      noncesObj,
      sigPkg.commitments,
      sigPkg.message,
      pkg.identifier
    );

    return JSON.stringify(result);
  }

  async aggregateSignature(
    signingPackage: string,
    signatureShares: Record<string, string>,
    publicKeyPackage: string,
    _randomizer?: string // Ignored for Ed25519
  ): Promise<string> {
    const sigPkg = JSON.parse(signingPackage) as {
      message: string;
      commitments: Array<{ identifier: number; hiding: string; binding: string }>;
    };

    const pubPkg = JSON.parse(publicKeyPackage) as {
      group_public_key: string;
    };

    // Convert shares record to array
    const sharesArray = Object.entries(signatureShares).map(([id, share]) => {
      const parsed = JSON.parse(share) as { identifier: number; share: string };
      return parsed;
    });

    const result = await frostWasm.aggregateSignature(
      sharesArray,
      sigPkg.commitments,
      sigPkg.message,
      pubPkg.group_public_key
    );

    return result.signature;
  }

  async verifySignature(
    signature: string,
    message: string,
    groupPublicKey: string,
    _randomizer?: string // Ignored for Ed25519
  ): Promise<boolean> {
    return frostWasm.verifySignature(signature, message, groupPublicKey);
  }

  // Ed25519 doesn't have createSigningPackage - it's handled inline
  // Signing package is just { message, commitments }
}

/**
 * Create signing package for Ed25519.
 * This is a helper function since Ed25519 doesn't need rerandomization.
 */
export function createEd25519SigningPackage(
  message: string,
  commitments: Record<string, string>
): string {
  const commitmentsArray = Object.entries(commitments).map(([_id, commitment]) => {
    return JSON.parse(commitment) as { identifier: number; hiding: string; binding: string };
  });

  return JSON.stringify({
    message,
    commitments: commitmentsArray,
  });
}

// Singleton instance
let instance: Ed25519Backend | null = null;

/**
 * Get the Ed25519 backend instance.
 */
export async function getEd25519Backend(): Promise<FrostBackend> {
  if (!instance) {
    // Ensure WASM is loaded
    await frostWasm.loadFrostWasm();
    instance = new Ed25519Backend();
  }
  return instance;
}

export default Ed25519Backend;
