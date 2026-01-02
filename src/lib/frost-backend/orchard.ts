/**
 * Orchard (RedPallas) FROST Backend
 *
 * Implements the FrostBackend interface using frost-zcash-wasm (RedPallas).
 * Supports rerandomized FROST for Zcash Orchard compatibility.
 */

import type { FrostBackend, KeyGenResult, Round1Result, SigningPackageResult } from './types';
import * as frostZcashWasm from '../frost-zcash-wasm/loader';

/**
 * Orchard (RedPallas) FROST backend implementation.
 */
class OrchardBackend implements FrostBackend {
  readonly backendId = 'orchard-redpallas' as const;

  async generateKeyShares(threshold: number, total: number): Promise<KeyGenResult> {
    const result = frostZcashWasm.generateKeyShares(threshold, total);

    return {
      groupPublicKey: result.group_public_key,
      shares: result.shares.map((share) => ({
        identifier: share.identifier,
        keyPackage: share.key_package,
      })),
      publicKeyPackage: result.public_key_package,
      threshold: result.threshold,
      total: result.total,
    };
  }

  async generateRound1(keyPackage: string): Promise<Round1Result> {
    const result = frostZcashWasm.generateRound1Commitment(keyPackage);

    return {
      nonces: JSON.stringify(result.nonces),
      commitment: JSON.stringify(result.commitment),
      identifier: result.commitment.identifier,
    };
  }

  async generateRound2(
    keyPackage: string,
    nonces: string,
    signingPackage: string,
    randomizer?: string
  ): Promise<string> {
    if (!randomizer) {
      throw new Error('Randomizer is required for Orchard (RedPallas) signing');
    }

    const result = frostZcashWasm.generateRound2Signature(
      keyPackage,
      nonces,
      signingPackage,
      randomizer
    );

    return JSON.stringify(result);
  }

  async aggregateSignature(
    signingPackage: string,
    signatureShares: Record<string, string>,
    publicKeyPackage: string,
    randomizer?: string
  ): Promise<string> {
    if (!randomizer) {
      throw new Error('Randomizer is required for Orchard (RedPallas) aggregation');
    }

    // Convert shares record to array format expected by WASM
    const sharesArray = Object.entries(signatureShares).map(([_id, share]) => {
      return JSON.parse(share) as { identifier: number; share: string };
    });

    const result = frostZcashWasm.aggregateSignature(
      JSON.stringify(sharesArray),
      signingPackage,
      publicKeyPackage,
      randomizer
    );

    return result.signature;
  }

  async verifySignature(
    signature: string,
    message: string,
    groupPublicKey: string,
    randomizer?: string
  ): Promise<boolean> {
    if (!randomizer) {
      throw new Error('Randomizer is required for Orchard (RedPallas) verification');
    }

    const result = frostZcashWasm.verifySignature(signature, message, groupPublicKey, randomizer);
    return result.valid;
  }

  /**
   * Create signing package with randomizer (Orchard-specific).
   *
   * This generates the signing package AND the randomizer in one call.
   * The randomizer must be distributed to all signers.
   */
  async createSigningPackage(
    message: string,
    commitments: Record<string, string>,
    publicKeyPackage: string
  ): Promise<SigningPackageResult> {
    // Convert commitments record to array format
    const commitmentsArray = Object.entries(commitments).map(([_id, commitment]) => {
      return JSON.parse(commitment) as { identifier: number; commitment: string };
    });

    const result = frostZcashWasm.createSigningPackage(
      JSON.stringify(commitmentsArray),
      message,
      publicKeyPackage
    );

    return {
      signingPackage: result.signing_package,
      randomizer: result.randomizer,
    };
  }
}

// Singleton instance
let instance: OrchardBackend | null = null;

/**
 * Get the Orchard (RedPallas) backend instance.
 */
export async function getOrchardBackend(): Promise<FrostBackend> {
  if (!instance) {
    // Ensure WASM is loaded
    await frostZcashWasm.initFrostZcash();
    instance = new OrchardBackend();
  }
  return instance;
}

export default OrchardBackend;
