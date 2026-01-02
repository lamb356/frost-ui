/**
 * useSigning Hook
 *
 * Integrates XState machines with frostd client and FROST backend
 * for real signing ceremonies.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createActor, fromPromise } from 'xstate';
import { useClient } from './useClient';
import { useFrostStore } from '@/lib/store';
import { getBackend, type BackendId, type FrostBackend } from '@/lib/frost-backend';
import {
  coordinatorMachine,
  createInitialCoordinatorContext,
  type CoordinatorContext,
  type CoordinatorEvent,
} from '@/lib/state-machines/coordinator-machine';
import {
  participantMachine,
  createInitialParticipantContext,
  type ParticipantContext,
  type ParticipantEvent,
  type KeyPackage,
  type SigningNonces,
} from '@/lib/state-machines/participant-machine';
import type {
  FrostMessage,
  Round1CommitmentPayload,
  Round2SignatureSharePayload,
} from '@/types/messages';
import {
  createSigningPackage,
  isMessageType,
  hexToMessage,
  messageToHex,
} from '@/types/messages';
import { loadFrostShare } from '@/lib/crypto/keystore';

// =============================================================================
// Types
// =============================================================================

export type SigningRole = 'coordinator' | 'participant';

export type SigningPhase =
  | 'idle'
  | 'setup'
  | 'creating_session'
  | 'waiting_for_participants'
  | 'round1_collect'
  | 'round1_send'
  | 'round2_collect'
  | 'round2_send'
  | 'confirm'
  | 'aggregating'
  | 'complete'
  | 'failed';

export interface SigningState {
  role: SigningRole | null;
  phase: SigningPhase;
  backendId: BackendId;
  sessionId: string | null;
  message: string | null;
  error: string | null;
  signature: string | null;
  verified: boolean;
  participantStatuses: Map<number, 'waiting' | 'committed' | 'signed'>;
}

export interface UseSigningResult {
  state: SigningState;
  // Coordinator actions
  startAsCoordinator: (
    participantPubkeys: string[],
    threshold: number,
    backendId: BackendId
  ) => Promise<void>;
  startSigning: (message: string, signerIds: number[]) => void;
  // Participant actions
  startAsParticipant: (sessionId: string, groupId: string, password: string) => Promise<void>;
  confirmSigning: () => void;
  rejectSigning: () => void;
  // Common actions
  cancel: () => void;
  reset: () => void;
  setBackendId: (backendId: BackendId) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useSigning(): UseSigningResult {
  const client = useClient();
  const pubkey = useFrostStore((state) => state.pubkey);

  // State
  const [state, setState] = useState<SigningState>({
    role: null,
    phase: 'idle',
    backendId: 'ed25519',
    sessionId: null,
    message: null,
    error: null,
    signature: null,
    verified: false,
    participantStatuses: new Map(),
  });

  // Refs
  const backendRef = useRef<FrostBackend | null>(null);
  const coordinatorActorRef = useRef<ReturnType<typeof createActor<typeof coordinatorMachine>> | null>(null);
  const participantActorRef = useRef<ReturnType<typeof createActor<typeof participantMachine>> | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const keyPackageRef = useRef<KeyPackage | null>(null);

  // Load backend on backendId change
  useEffect(() => {
    let mounted = true;
    getBackend(state.backendId).then((backend) => {
      if (mounted) {
        backendRef.current = backend;
      }
    });
    return () => {
      mounted = false;
    };
  }, [state.backendId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
      }
      if (coordinatorActorRef.current) {
        coordinatorActorRef.current.stop();
      }
      if (participantActorRef.current) {
        participantActorRef.current.stop();
      }
    };
  }, []);

  // Set backend ID
  const setBackendId = useCallback((backendId: BackendId) => {
    setState((prev) => ({ ...prev, backendId }));
  }, []);

  // ==========================================================================
  // Coordinator Flow
  // ==========================================================================

  const startAsCoordinator = useCallback(
    async (participantPubkeys: string[], threshold: number, backendId: BackendId) => {
      if (!client || !pubkey) {
        setState((prev) => ({ ...prev, error: 'Not authenticated' }));
        return;
      }

      // Load backend
      const backend = await getBackend(backendId);
      backendRef.current = backend;

      setState((prev) => ({
        ...prev,
        role: 'coordinator',
        phase: 'creating_session',
        backendId,
        error: null,
      }));

      try {
        // Create session via frostd
        const response = await client.createSession(
          [pubkey, ...participantPubkeys],
          1
        );

        const sessionId = response.session_id;

        setState((prev) => ({
          ...prev,
          sessionId,
          phase: 'waiting_for_participants',
        }));

        // Create coordinator actor with injected services
        const actor = createActor(
          coordinatorMachine.provide({
            actors: {
              createSession: fromPromise(async () => ({ sessionId })),
              sendMessage: fromPromise(async ({ input }) => {
                const { sessionId: sid, message, recipients } = input;
                const hexMsg = messageToHex(message);
                await client.send(sid, recipients, hexMsg);
              }),
              aggregateSignature: fromPromise(async ({ input }) => {
                const { message, commitments, shares } = input as {
                  message: string;
                  commitments: Round1CommitmentPayload[];
                  shares: Round2SignatureSharePayload[];
                };
                // Use backend to aggregate
                const signingPackage = JSON.stringify({
                  message,
                  commitments: commitments.map((c: Round1CommitmentPayload) => ({
                    identifier: c.participantId,
                    hiding: c.hiding,
                    binding: c.binding,
                  })),
                });
                const sharesRecord: Record<string, string> = {};
                shares.forEach((s: Round2SignatureSharePayload) => {
                  sharesRecord[String(s.participantId)] = JSON.stringify({
                    identifier: s.participantId,
                    share: s.share,
                  });
                });
                // For now, use a placeholder - real aggregation needs publicKeyPackage
                const signature = await backend.aggregateSignature(
                  signingPackage,
                  sharesRecord,
                  '{}', // publicKeyPackage - needs to be passed from context
                  undefined // randomizer for Orchard
                );
                const verified = await backend.verifySignature(
                  signature,
                  message,
                  '', // groupPublicKey
                  undefined
                );
                return { signature, verified };
              }),
              closeSession: fromPromise(async ({ input }) => {
                await client.closeSession(input.sessionId);
              }),
            },
          }),
          {
            input: createInitialCoordinatorContext(pubkey, {
              round1TimeoutMs: 120000,
              round2TimeoutMs: 120000,
            }),
          }
        );

        // Subscribe to state changes
        actor.subscribe((snapshot) => {
          const ctx = snapshot.context as CoordinatorContext;
          const stateName = snapshot.value as string;

          let phase: SigningPhase = 'idle';
          switch (stateName) {
            case 'idle':
              phase = 'idle';
              break;
            case 'creatingSession':
              phase = 'creating_session';
              break;
            case 'waiting':
              phase = 'waiting_for_participants';
              break;
            case 'round1Collect':
              phase = 'round1_collect';
              break;
            case 'round2Send':
            case 'round2Collect':
              phase = 'round2_collect';
              break;
            case 'aggregating':
              phase = 'aggregating';
              break;
            case 'broadcasting':
            case 'complete':
              phase = 'complete';
              break;
            case 'failed':
              phase = 'failed';
              break;
          }

          // Build participant statuses
          const participantStatuses = new Map<number, 'waiting' | 'committed' | 'signed'>();
          ctx.selectedSignerIds.forEach((id) => {
            if (ctx.signatureShares.has(id)) {
              participantStatuses.set(id, 'signed');
            } else if (ctx.commitments.has(id)) {
              participantStatuses.set(id, 'committed');
            } else {
              participantStatuses.set(id, 'waiting');
            }
          });

          setState((prev) => ({
            ...prev,
            phase,
            message: ctx.message,
            signature: ctx.aggregateSignature,
            verified: ctx.verified,
            error: ctx.error?.message ?? null,
            participantStatuses,
          }));
        });

        actor.start();
        coordinatorActorRef.current = actor;

        // Send UI_START to transition to waiting
        actor.send({
          type: 'UI_START',
          participantPubkeys: [pubkey, ...participantPubkeys],
          threshold,
        });

        // Start polling for messages
        startPolling(sessionId, true);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'failed',
          error: err instanceof Error ? err.message : 'Failed to create session',
        }));
      }
    },
    [client, pubkey]
  );

  const startSigning = useCallback((message: string, signerIds: number[]) => {
    const actor = coordinatorActorRef.current;
    if (!actor) return;

    // Send SIGNING_PACKAGE to all participants
    const ctx = actor.getSnapshot().context as CoordinatorContext;
    if (!ctx.sessionId || !pubkey) return;

    // Create and broadcast SIGNING_PACKAGE
    const signingPkg = createSigningPackage(
      ctx.sessionId,
      pubkey,
      state.backendId,
      message,
      signerIds
    );

    // Send via client
    if (client) {
      const hexMsg = messageToHex(signingPkg);
      client.send(ctx.sessionId, ctx.participantPubkeys, hexMsg);
    }

    actor.send({ type: 'UI_START_SIGNING', message, signerIds });
  }, [client, pubkey, state.backendId]);

  // ==========================================================================
  // Participant Flow
  // ==========================================================================

  const startAsParticipant = useCallback(
    async (sessionId: string, groupId: string, password: string) => {
      if (!client || !pubkey) {
        setState((prev) => ({ ...prev, error: 'Not authenticated' }));
        return;
      }

      setState((prev) => ({
        ...prev,
        role: 'participant',
        phase: 'setup',
        sessionId,
        error: null,
      }));

      try {
        // Load FROST key share
        const share = await loadFrostShare(groupId, password);
        const keyPackage: KeyPackage = {
          participantId: share.participantId,
          secretShare: share.secretShare,
          groupPublicKey: share.groupPublicKey,
          publicKeyShares: {},
          threshold: share.threshold,
          totalParticipants: share.totalParticipants,
        };
        keyPackageRef.current = keyPackage;

        // Get session info
        const sessionInfo = await client.getSessionInfo(sessionId);

        // Create participant actor with injected services
        const actor = createActor(
          participantMachine.provide({
            actors: {
              getSessionInfo: fromPromise(async () => ({
                coordinatorPubkey: sessionInfo.coordinator_pubkey,
              })),
              sendMessage: fromPromise(async ({ input }) => {
                const { sessionId: sid, message, recipients } = input;
                const hexMsg = messageToHex(message);
                await client.send(sid, recipients, hexMsg);
              }),
              generateRound1: fromPromise(async ({ input }) => {
                const backend = backendRef.current;
                if (!backend) throw new Error('Backend not loaded');

                const result = await backend.generateRound1(
                  JSON.stringify({
                    identifier: input.participantId,
                    signing_share: input.keyPackage.secretShare,
                  })
                );

                const nonces: SigningNonces = {
                  hiding: JSON.parse(result.nonces).hiding,
                  binding: JSON.parse(result.nonces).binding,
                };

                const commitment: Round1CommitmentPayload = {
                  participantId: input.participantId,
                  hiding: JSON.parse(result.commitment).hiding,
                  binding: JSON.parse(result.commitment).binding,
                };

                return { nonces, commitment };
              }),
              generateRound2: fromPromise(async ({ input }) => {
                const backend = backendRef.current;
                if (!backend) throw new Error('Backend not loaded');

                const typedInput = input as {
                  participantId: number;
                  keyPackage: KeyPackage;
                  nonces: SigningNonces;
                  message: string;
                  allCommitments: Round1CommitmentPayload[];
                  signerIds: number[];
                };

                const signingPackage = JSON.stringify({
                  message: typedInput.message,
                  commitments: typedInput.allCommitments.map((c: Round1CommitmentPayload) => ({
                    identifier: c.participantId,
                    hiding: c.hiding,
                    binding: c.binding,
                  })),
                });

                const nonces = JSON.stringify({
                  identifier: typedInput.participantId,
                  hiding: typedInput.nonces.hiding,
                  binding: typedInput.nonces.binding,
                });

                const result = await backend.generateRound2(
                  JSON.stringify({
                    identifier: typedInput.participantId,
                    signing_share: typedInput.keyPackage.secretShare,
                  }),
                  nonces,
                  signingPackage,
                  undefined // randomizer for Orchard
                );

                const parsed = JSON.parse(result);
                const share: Round2SignatureSharePayload = {
                  participantId: typedInput.participantId,
                  share: parsed.share,
                };

                return { share };
              }),
            },
          }),
          {
            input: createInitialParticipantContext(pubkey, share.participantId, keyPackage),
          }
        );

        // Subscribe to state changes
        actor.subscribe((snapshot) => {
          const ctx = snapshot.context as ParticipantContext;
          const stateName = snapshot.value as string;

          let phase: SigningPhase = 'idle';
          switch (stateName) {
            case 'idle':
              phase = 'idle';
              break;
            case 'ready':
            case 'awaitSigning':
              phase = 'waiting_for_participants';
              break;
            case 'round1':
            case 'sendingCommitment':
              phase = 'round1_send';
              break;
            case 'awaitCommitments':
              phase = 'round1_collect';
              break;
            case 'confirm':
              phase = 'confirm';
              break;
            case 'round2':
            case 'sendingShare':
              phase = 'round2_send';
              break;
            case 'awaitResult':
              phase = 'round2_collect';
              break;
            case 'complete':
              phase = 'complete';
              break;
            case 'failed':
            case 'aborting':
              phase = 'failed';
              break;
          }

          setState((prev) => ({
            ...prev,
            phase,
            message: ctx.signingMessage,
            signature: ctx.aggregateSignature,
            verified: ctx.verified,
            error: ctx.error?.message ?? null,
          }));
        });

        actor.start();
        participantActorRef.current = actor;

        // Send UI_JOIN to start
        actor.send({ type: 'UI_JOIN', sessionId });

        // Start polling for messages
        startPolling(sessionId, false);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'failed',
          error: err instanceof Error ? err.message : 'Failed to join session',
        }));
      }
    },
    [client, pubkey]
  );

  const confirmSigning = useCallback(() => {
    const actor = participantActorRef.current;
    if (actor) {
      actor.send({ type: 'UI_CONFIRM' });
    }
  }, []);

  const rejectSigning = useCallback(() => {
    const actor = participantActorRef.current;
    if (actor) {
      actor.send({ type: 'UI_REJECT' });
    }
  }, []);

  // ==========================================================================
  // Message Polling
  // ==========================================================================

  const startPolling = useCallback(
    (sessionId: string, asCoordinator: boolean) => {
      if (!client) return;

      // Abort any existing polling
      if (pollAbortRef.current) {
        pollAbortRef.current.abort();
      }

      const abortController = new AbortController();
      pollAbortRef.current = abortController;

      // Poll for messages
      const poll = async () => {
        while (!abortController.signal.aborted) {
          try {
            const messages = await client.receive(sessionId, asCoordinator, {
              signal: abortController.signal,
            });

            for (const msg of messages) {
              // Decrypt and parse message
              const decoded = hexToMessage(msg.msg);
              if (!decoded) continue;

              // Dispatch to appropriate actor
              if (asCoordinator && coordinatorActorRef.current) {
                handleCoordinatorMessage(decoded);
              } else if (!asCoordinator && participantActorRef.current) {
                handleParticipantMessage(decoded);
              }
            }
          } catch (err) {
            if (abortController.signal.aborted) break;
            console.error('Polling error:', err);
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      };

      poll();
    },
    [client]
  );

  const handleCoordinatorMessage = useCallback((msg: FrostMessage) => {
    const actor = coordinatorActorRef.current;
    if (!actor) return;

    if (isMessageType(msg, 'ROUND1_COMMITMENT')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_ROUND1_COMMITMENT',
        participantId: payload.participantId,
        hiding: payload.hiding,
        binding: payload.binding,
      } as CoordinatorEvent);
    } else if (isMessageType(msg, 'ROUND2_SIGNATURE_SHARE')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_ROUND2_SIGNATURE_SHARE',
        participantId: payload.participantId,
        share: payload.share,
      } as CoordinatorEvent);
    } else if (isMessageType(msg, 'ABORT')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_ABORT',
        reason: payload.reason,
        message: payload.message,
      } as CoordinatorEvent);
    }
  }, []);

  const handleParticipantMessage = useCallback((msg: FrostMessage) => {
    const actor = participantActorRef.current;
    if (!actor) return;

    if (isMessageType(msg, 'SIGNING_PACKAGE')) {
      const payload = msg.payload;
      // Validate backendId matches
      if (payload.backendId !== state.backendId) {
        console.warn('Backend ID mismatch:', payload.backendId, 'vs', state.backendId);
        // Update backend
        setState((prev) => ({ ...prev, backendId: payload.backendId }));
        getBackend(payload.backendId).then((backend) => {
          backendRef.current = backend;
        });
      }
      actor.send({
        type: 'RX_SIGNING_PACKAGE',
        message: payload.message,
        signerIds: payload.signerIds,
        coordinatorPubkey: payload.coordinatorPubkey,
        msgId: msg.id,
      } as ParticipantEvent);
    } else if (isMessageType(msg, 'COMMITMENTS_SET')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_COMMITMENTS_SET',
        commitments: payload.commitments,
        message: payload.message,
      } as ParticipantEvent);
    } else if (isMessageType(msg, 'SIGNATURE_RESULT')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_SIGNATURE_RESULT',
        signature: payload.signature,
        verified: payload.verified,
      } as ParticipantEvent);
    } else if (isMessageType(msg, 'ABORT')) {
      const payload = msg.payload;
      actor.send({
        type: 'RX_ABORT',
        reason: payload.reason,
        message: payload.message,
      } as ParticipantEvent);
    }
  }, [state.backendId]);

  // ==========================================================================
  // Common Actions
  // ==========================================================================

  const cancel = useCallback(() => {
    // Stop polling
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }

    // Send cancel to active actor
    if (coordinatorActorRef.current) {
      coordinatorActorRef.current.send({ type: 'UI_CANCEL' } as CoordinatorEvent);
    }
    if (participantActorRef.current) {
      participantActorRef.current.send({ type: 'UI_CANCEL' } as ParticipantEvent);
    }
  }, []);

  const reset = useCallback(() => {
    // Stop polling
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }

    // Stop and clear actors
    if (coordinatorActorRef.current) {
      coordinatorActorRef.current.stop();
      coordinatorActorRef.current = null;
    }
    if (participantActorRef.current) {
      participantActorRef.current.stop();
      participantActorRef.current = null;
    }

    // Reset state
    setState({
      role: null,
      phase: 'idle',
      backendId: 'ed25519',
      sessionId: null,
      message: null,
      error: null,
      signature: null,
      verified: false,
      participantStatuses: new Map(),
    });
  }, []);

  return {
    state,
    startAsCoordinator,
    startSigning,
    startAsParticipant,
    confirmSigning,
    rejectSigning,
    cancel,
    reset,
    setBackendId,
  };
}
