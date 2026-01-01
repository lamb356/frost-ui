'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFrostStore } from '@/lib/store';
import {
  getFrostOperations,
  isWasmReady,
  type FrostOperations,
  type KeyGenResult,
  type Round1Result,
  type SignatureShare,
  type AggregateSignature,
  type Commitment,
  type SigningNonces,
} from '@/lib/frost-wasm/loader';

// =============================================================================
// Types
// =============================================================================

export interface UseFrostResult {
  /** Whether FROST operations are ready */
  isReady: boolean;
  /** Whether using real WASM crypto (vs mock) */
  isRealCrypto: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error if FROST failed to load */
  error: string | null;
  /** Generate key shares */
  generateKeyShares: (threshold: number, total: number) => Promise<KeyGenResult | null>;
  /** Generate Round 1 commitment */
  generateRound1: (signingShare: string, identifier: number) => Promise<Round1Result | null>;
  /** Generate Round 2 signature share */
  generateRound2: (
    signingShare: string,
    nonces: SigningNonces,
    commitments: Commitment[],
    messageHex: string,
    identifier: number
  ) => Promise<SignatureShare | null>;
  /** Aggregate signature shares */
  aggregate: (
    shares: SignatureShare[],
    commitments: Commitment[],
    messageHex: string,
    groupPublicKey: string
  ) => Promise<AggregateSignature | null>;
  /** Verify a signature */
  verify: (
    signature: string,
    messageHex: string,
    groupPublicKey: string
  ) => Promise<boolean>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFrost(): UseFrostResult {
  const demoMode = useFrostStore((state) => state.demoMode);
  const [operations, setOperations] = useState<FrostOperations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load FROST operations
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const ops = await getFrostOperations();
        if (!cancelled) {
          setOperations(ops);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load FROST');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Generate key shares
  const generateKeyShares = useCallback(
    async (threshold: number, total: number): Promise<KeyGenResult | null> => {
      if (!operations) return null;
      try {
        return await operations.generateKeyShares(threshold, total);
      } catch (err) {
        console.error('Key generation failed:', err);
        return null;
      }
    },
    [operations]
  );

  // Generate Round 1 commitment
  const generateRound1 = useCallback(
    async (signingShare: string, identifier: number): Promise<Round1Result | null> => {
      if (!operations) return null;
      try {
        return await operations.generateRound1Commitment(signingShare, identifier);
      } catch (err) {
        console.error('Round 1 failed:', err);
        return null;
      }
    },
    [operations]
  );

  // Generate Round 2 signature share
  const generateRound2 = useCallback(
    async (
      signingShare: string,
      nonces: SigningNonces,
      commitments: Commitment[],
      messageHex: string,
      identifier: number
    ): Promise<SignatureShare | null> => {
      if (!operations) return null;
      try {
        return await operations.generateRound2Signature(
          signingShare,
          nonces,
          commitments,
          messageHex,
          identifier
        );
      } catch (err) {
        console.error('Round 2 failed:', err);
        return null;
      }
    },
    [operations]
  );

  // Aggregate signature shares
  const aggregate = useCallback(
    async (
      shares: SignatureShare[],
      commitments: Commitment[],
      messageHex: string,
      groupPublicKey: string
    ): Promise<AggregateSignature | null> => {
      if (!operations) return null;
      try {
        return await operations.aggregateSignature(shares, commitments, messageHex, groupPublicKey);
      } catch (err) {
        console.error('Aggregation failed:', err);
        return null;
      }
    },
    [operations]
  );

  // Verify signature
  const verify = useCallback(
    async (
      signature: string,
      messageHex: string,
      groupPublicKey: string
    ): Promise<boolean> => {
      if (!operations) return false;
      try {
        return await operations.verifySignature(signature, messageHex, groupPublicKey);
      } catch (err) {
        console.error('Verification failed:', err);
        return false;
      }
    },
    [operations]
  );

  return {
    isReady: operations !== null,
    isRealCrypto: operations?.isRealCrypto ?? false,
    isLoading,
    error,
    generateKeyShares,
    generateRound1,
    generateRound2,
    aggregate,
    verify,
  };
}
