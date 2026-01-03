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
import type { FrostMessage } from '@/types/messages';
import {
  createSigningPackage,
  isMessageType,
  hexToMessage,
  messageToHex,
  generateMessageId,
} from '@/types/messages';
import { loadFrostShare } from '@/lib/crypto/keystore';
import {
  DeduplicationSet,
  validateMessage,
  type ProtocolPhase,
} from '@/lib/state-machines/validation';

// =============================================================================
// Internal Types (used by state machines, not wire format)
// =============================================================================

/**
 * Internal commitment format used by state machines.
 * This is converted to/from wire format when sending/receiving messages.
 */
interface InternalCommitment {
  participantId: number;
  hiding: string;
  binding: string;
}

/**
 * Internal signature share format used by state machines.
 */
interface InternalSignatureShare {
  participantId: number;
  share: string;
}

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
  startSigning: (message: string, signerIds: number[], publicKeyPackage: string, groupPublicKey: string) => void;
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
  const dedupeSetRef = useRef<DeduplicationSet>(new DeduplicationSet());

  // Validation context refs - updated as ceremony progresses
  const sessionIdRef = useRef<string | null>(null);
  const expectedMessageIdRef = useRef<string | null>(null);
  const backendIdRef = useRef<BackendId>(state.backendId);
  const currentPhaseRef = useRef<ProtocolPhase>('idle');

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
      backendIdRef.current = backendId;
      currentPhaseRef.current = 'idle';

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
        sessionIdRef.current = sessionId;

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
              createSigningPackage: fromPromise(async ({ input }) => {
                // Create signing package from collected commitments
                const typedInput = input as {
                  message: string;
                  commitments: { participantId: number; hiding: string; binding: string }[];
                  publicKeyPackage?: string;
                };

                // For Ed25519, we don't need to call backend - just construct the package
                if (!backend.createSigningPackage) {
                  // Ed25519: Create signing package manually
                  const signingPackage = JSON.stringify({
                    message: typedInput.message,
                    commitments: typedInput.commitments.map((c) => ({
                      identifier: c.participantId,
                      hiding: c.hiding,
                      binding: c.binding,
                    })),
                  });
                  return {
                    signingPackage,
                    randomizer: '',
                  };
                }

                // Orchard: Call backend to create signing package with randomizer
                // Convert array to Record<string, string> format
                const commitmentsRecord: Record<string, string> = {};
                typedInput.commitments.forEach((c) => {
                  commitmentsRecord[String(c.participantId)] = JSON.stringify({
                    identifier: c.participantId,
                    hiding: c.hiding,
                    binding: c.binding,
                  });
                });

                if (!typedInput.publicKeyPackage) {
                  throw new Error('publicKeyPackage required for Orchard signing');
                }

                const result = await backend.createSigningPackage(
                  typedInput.message,
                  commitmentsRecord,
                  typedInput.publicKeyPackage
                );
                return {
                  signingPackage: result.signingPackage,
                  randomizer: result.randomizer || '',
                };
              }),
              aggregateSignature: fromPromise(async ({ input }) => {
                // The coordinator machine passes internal format from context
                const { message, commitments, shares, publicKeyPackage, randomizer } = input as {
                  message: string;
                  commitments: InternalCommitment[];
                  shares: InternalSignatureShare[];
                  publicKeyPackage: string;
                  randomizer?: string;
                };

                // Convert internal commitments to signing package format
                const signingPackage = JSON.stringify({
                  message,
                  commitments: commitments.map((c) => ({
                    identifier: c.participantId,
                    hiding: c.hiding,
                    binding: c.binding,
                  })),
                });

                // Convert internal shares to Record format for backend
                const sharesRecord: Record<string, string> = {};
                shares.forEach((s) => {
                  sharesRecord[String(s.participantId)] = JSON.stringify({
                    identifier: s.participantId,
                    share: s.share,
                  });
                });

                const signature = await backend.aggregateSignature(
                  signingPackage,
                  sharesRecord,
                  publicKeyPackage,
                  randomizer
                );

                // Get group public key from publicKeyPackage for verification
                const pkgParsed = JSON.parse(publicKeyPackage);
                const groupPublicKey = pkgParsed.group_public_key || pkgParsed.groupPublicKey || '';
                const verified = await backend.verifySignature(
                  signature,
                  message,
                  groupPublicKey,
                  randomizer
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

  const startSigning = useCallback((message: string, signerIds: number[], publicKeyPackage: string, groupPublicKey: string) => {
    const actor = coordinatorActorRef.current;
    if (!actor) return;

    // Send SIGNING_PACKAGE to all participants
    const ctx = actor.getSnapshot().context as CoordinatorContext;
    if (!ctx.sessionId || !pubkey) return;

    // Generate message_id for this signing attempt
    const messageId = generateMessageId();

    // Get selected signer pubkeys (filter out coordinator if not signing)
    const selectedSigners = ctx.participantPubkeys.filter((_, i) =>
      signerIds.includes(i + 1) // participant IDs are 1-indexed
    );

    // Create and broadcast SIGNING_PACKAGE
    const signingPkg = createSigningPackage(
      ctx.sessionId,
      pubkey,
      state.backendId,
      messageId,
      message,
      selectedSigners,
      signerIds
    );

    // Send via client to participants (not to self)
    if (client) {
      const hexMsg = messageToHex(signingPkg);
      const recipients = ctx.participantPubkeys.filter((p) => p !== pubkey);
      client.send(ctx.sessionId, recipients, hexMsg);
    }

    // Update validation context for coordinator
    expectedMessageIdRef.current = messageId;
    currentPhaseRef.current = 'round1';

    // Pass backendId, publicKeyPackage, groupPublicKey to coordinator machine
    actor.send({
      type: 'UI_START_SIGNING',
      message,
      signerIds,
      messageId,
      backendId: state.backendId,
      publicKeyPackage,
      groupPublicKey,
    });
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

      // Set validation context
      sessionIdRef.current = sessionId;
      currentPhaseRef.current = 'idle';

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

                const commitment: InternalCommitment = {
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
                  allCommitments: InternalCommitment[];
                  signerIds: number[];
                  signingPackage?: string;
                  randomizer?: string;
                };

                // Use signing_package from COMMITMENTS_SET if available, otherwise construct from commitments
                const signingPackage = typedInput.signingPackage || JSON.stringify({
                  message: typedInput.message,
                  commitments: typedInput.allCommitments.map((c: InternalCommitment) => ({
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
                  typedInput.randomizer // Use randomizer from COMMITMENTS_SET for Orchard
                );

                const parsed = JSON.parse(result);
                const share: InternalSignatureShare = {
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

              // === FULL INGRESS VALIDATION ===
              // validateMessage includes: envelope, freshness, session binding, deduplication, phase
              const validationResult = validateMessage(decoded, {
                expectedSessionId: sessionIdRef.current || sessionId,
                expectedMessageId: expectedMessageIdRef.current || undefined,
                expectedBackend: backendIdRef.current,
                currentPhase: currentPhaseRef.current,
                dedupeSet: dedupeSetRef.current,
                checkFreshness: true,
              });

              if (!validationResult.valid) {
                console.warn('Message validation failed:', validationResult.error.message);
                continue;
              }

              // Dispatch to appropriate actor
              if (asCoordinator && coordinatorActorRef.current) {
                handleCoordinatorMessage(validationResult.message);
              } else if (!asCoordinator && participantActorRef.current) {
                await handleParticipantMessage(validationResult.message);
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
      // Convert from wire format (WasmCommitment) to internal event format
      // The commitment object contains identifier and the commitment string
      // Parse the commitment string to get hiding/binding (for Ed25519) or use raw (for Orchard)
      const commitmentData = JSON.parse(payload.commitment.commitment);
      actor.send({
        type: 'RX_ROUND1_COMMITMENT',
        participantId: payload.commitment.identifier,
        hiding: commitmentData.hiding || '',
        binding: commitmentData.binding || '',
      } as CoordinatorEvent);
    } else if (isMessageType(msg, 'ROUND2_SIGNATURE_SHARE')) {
      const payload = msg.payload;
      // Convert from wire format (WasmSignatureShare) to internal event format
      actor.send({
        type: 'RX_ROUND2_SIGNATURE_SHARE',
        participantId: payload.share.identifier,
        share: payload.share.share,
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

  const handleParticipantMessage = useCallback(async (msg: FrostMessage) => {
    const actor = participantActorRef.current;
    if (!actor) return;

    if (isMessageType(msg, 'SIGNING_PACKAGE')) {
      const payload = msg.payload;

      // Handle backend switch - AWAIT before sending to machine (Issue 2 fix)
      if (payload.backendId !== backendIdRef.current) {
        console.log('Switching backend:', backendIdRef.current, '->', payload.backendId);
        const newBackend = await getBackend(payload.backendId);
        backendRef.current = newBackend;
        backendIdRef.current = payload.backendId;
        setState((prev) => ({ ...prev, backendId: payload.backendId }));
      }

      // Update validation context for participant
      expectedMessageIdRef.current = payload.message_id;
      currentPhaseRef.current = 'round1';

      // Now safe to send to machine
      actor.send({
        type: 'RX_SIGNING_PACKAGE',
        message: payload.message_to_sign,
        signerIds: payload.signer_ids,
        coordinatorPubkey: msg.from, // Coordinator's pubkey is the sender
        msgId: payload.message_id,
      } as ParticipantEvent);
    } else if (isMessageType(msg, 'COMMITMENTS_SET')) {
      const payload = msg.payload;
      // Convert WasmCommitment array to internal format for participant machine
      // The machine expects commitments as array of { participantId, hiding, binding }
      const internalCommitments = payload.commitments.map((c) => {
        const data = JSON.parse(c.commitment);
        return {
          participantId: c.identifier,
          hiding: data.hiding || '',
          binding: data.binding || '',
        };
      });

      // Update phase to round2
      currentPhaseRef.current = 'round2';

      actor.send({
        type: 'RX_COMMITMENTS_SET',
        commitments: internalCommitments,
        signingPackage: payload.signing_package,
        randomizer: payload.randomizer,
        groupPublicKey: payload.group_public_key,
      } as ParticipantEvent);
    } else if (isMessageType(msg, 'SIGNATURE_RESULT')) {
      const payload = msg.payload;

      // Update phase to complete
      currentPhaseRef.current = 'complete';

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
  }, []);

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

    // Reset deduplication set and validation context
    dedupeSetRef.current = new DeduplicationSet();
    sessionIdRef.current = null;
    expectedMessageIdRef.current = null;
    backendIdRef.current = 'ed25519';
    currentPhaseRef.current = 'idle';

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
