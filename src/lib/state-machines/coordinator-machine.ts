/**
 * Coordinator State Machine (Production-Ready)
 *
 * Manages the FROST signing ceremony from the coordinator's perspective.
 * Implements the protocol specified by frostd with full error handling.
 *
 * Design principles:
 * - Single source of truth = message log
 * - State derived by replaying messages
 * - Side effects (send/poll) are isolated actors
 * - No non-spec concepts (inviteCode, etc.)
 */

import { createMachine, assign, fromPromise, type ActorRefFrom } from 'xstate';
import type {
  FrostMessage,
  AbortReason,
  BackendId,
} from '@/types/messages';
import {
  createCommitmentsSet,
  createSignatureResult,
  createAbort,
} from '@/types/messages';
import {
  type ProtocolPhase,
  DeduplicationSet,
  NonceTracker,
} from './validation';

// =============================================================================
// Internal Types (separate from wire format)
// =============================================================================

/**
 * Internal commitment format stored in coordinator context.
 * This is separate from the wire format (WasmCommitment).
 */
export interface InternalCommitment {
  participantId: number;
  hiding: string;
  binding: string;
}

/**
 * Internal signature share format stored in coordinator context.
 * This is separate from the wire format (WasmSignatureShare).
 */
export interface InternalSignatureShare {
  participantId: number;
  share: string;
}

// =============================================================================
// Types
// =============================================================================

export interface CoordinatorContext {
  sessionId: string | null;
  coordinatorPubkey: string;
  threshold: number;
  maxParticipants: number;
  participantPubkeys: string[];
  message: string | null;
  messageId: string | null;  // Unique ID for current signing attempt
  selectedSignerIds: number[];
  messageLog: FrostMessage[];
  commitments: Map<number, InternalCommitment>;
  signatureShares: Map<number, InternalSignatureShare>;
  aggregateSignature: string | null;
  verified: boolean;
  error: CoordinatorError | null;
  abortReason: AbortReason | null;
  dedupeSet: DeduplicationSet;
  nonceTracker: NonceTracker;
  round1TimeoutMs: number;
  round2TimeoutMs: number;
  sessionTimeoutMs: number;
  phase: ProtocolPhase;
  // New fields for canonical wire format
  backendId: BackendId;            // FROST backend to use
  signingPackage: string | null;   // From backend.createSigningPackage()
  randomizer: string | null;       // From backend.createSigningPackage()
  groupPublicKey: string | null;   // From key generation
  publicKeyPackage: string | null; // From key generation
}

export interface CoordinatorError {
  code: CoordinatorErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type CoordinatorErrorCode =
  | 'SESSION_CREATION_FAILED'
  | 'ROUND1_TIMEOUT'
  | 'ROUND2_TIMEOUT'
  | 'THRESHOLD_NOT_MET'
  | 'INVALID_MESSAGE'
  | 'AGGREGATION_FAILED'
  | 'SIGNER_DROPPED'
  | 'SESSION_EXPIRED'
  | 'ABORTED';

export type CoordinatorEvent =
  | { type: 'UI_START'; participantPubkeys: string[]; threshold: number }
  | { type: 'UI_START_SIGNING'; message: string; signerIds: number[]; messageId: string; backendId: BackendId; publicKeyPackage: string; groupPublicKey: string }
  | { type: 'UI_CANCEL' }
  | { type: 'UI_RESET' }
  | { type: 'RX_ROUND1_COMMITMENT'; participantId: number; hiding: string; binding: string }
  | { type: 'RX_ROUND2_SIGNATURE_SHARE'; participantId: number; share: string }
  | { type: 'RX_ABORT'; reason: AbortReason; message: string }
  | { type: 'AGGREGATE_SUCCESS'; signature: string; verified: boolean }
  | { type: 'AGGREGATE_FAILED'; error: string }
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'SEND_SUCCESS' }
  | { type: 'SEND_FAILED'; error: string };

export function createInitialCoordinatorContext(
  coordinatorPubkey: string,
  options: {
    round1TimeoutMs?: number;
    round2TimeoutMs?: number;
    sessionTimeoutMs?: number;
    backendId?: BackendId;
  } = {}
): CoordinatorContext {
  return {
    sessionId: null,
    coordinatorPubkey,
    threshold: 2,
    maxParticipants: 3,
    participantPubkeys: [],
    message: null,
    messageId: null,
    selectedSignerIds: [],
    messageLog: [],
    commitments: new Map(),
    signatureShares: new Map(),
    aggregateSignature: null,
    verified: false,
    error: null,
    abortReason: null,
    dedupeSet: new DeduplicationSet(),
    nonceTracker: new NonceTracker(),
    round1TimeoutMs: options.round1TimeoutMs ?? 120000,
    round2TimeoutMs: options.round2TimeoutMs ?? 120000,
    sessionTimeoutMs: options.sessionTimeoutMs ?? 600000,
    phase: 'idle',
    backendId: options.backendId ?? 'ed25519',
    signingPackage: null,
    randomizer: null,
    groupPublicKey: null,
    publicKeyPackage: null,
  };
}

// =============================================================================
// Actor Logic (Services) - Placeholders for dependency injection
// =============================================================================

export const createSessionActor = fromPromise<
  { sessionId: string },
  { pubkeys: string[]; messageCount: number }
>(async () => {
  throw new Error('createSessionActor must be provided via machine options');
});

export const sendMessageActor = fromPromise<
  void,
  { sessionId: string; message: FrostMessage; recipients: string[] }
>(async () => {
  throw new Error('sendMessageActor must be provided via machine options');
});

export const createSigningPackageActor = fromPromise<
  { signingPackage: string; randomizer: string },
  {
    message: string;
    commitments: InternalCommitment[];
    publicKeyPackage?: string;
  }
>(async () => {
  throw new Error('createSigningPackageActor must be provided via machine options');
});

export const aggregateSignatureActor = fromPromise<
  { signature: string; verified: boolean },
  {
    message: string;
    commitments: InternalCommitment[];
    shares: InternalSignatureShare[];
    publicKeyPackage: string;
    randomizer?: string;
  }
>(async () => {
  throw new Error('aggregateSignatureActor must be provided via machine options');
});

export const closeSessionActor = fromPromise<void, { sessionId: string }>(
  async () => {
    throw new Error('closeSessionActor must be provided via machine options');
  }
);

// =============================================================================
// State Machine
// =============================================================================

export const coordinatorMachine = createMachine({
  id: 'coordinator',
  initial: 'idle',
  types: {
    context: {} as CoordinatorContext,
    events: {} as CoordinatorEvent,
  },
  context: createInitialCoordinatorContext(''),

  states: {
    idle: {
      on: {
        UI_START: {
          target: 'creatingSession',
          actions: assign({
            participantPubkeys: ({ event }) => event.participantPubkeys,
            threshold: ({ event }) => event.threshold,
            maxParticipants: ({ event }) => event.participantPubkeys.length,
            error: () => null,
          }),
        },
      },
    },

    creatingSession: {
      invoke: {
        id: 'createSession',
        src: createSessionActor,
        input: ({ context }) => ({
          pubkeys: context.participantPubkeys,
          messageCount: 1,
        }),
        onDone: {
          target: 'waiting',
          actions: assign({
            sessionId: ({ event }) => event.output.sessionId,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SESSION_CREATION_FAILED' as const,
              message: String(event.error),
            }),
          }),
        },
      },
      on: {
        UI_CANCEL: {
          target: 'idle',
          actions: assign(({ context }) => createInitialCoordinatorContext(context.coordinatorPubkey)),
        },
      },
    },

    waiting: {
      after: {
        600000: { // SESSION_TIMEOUT
          target: 'failed',
          actions: assign({
            error: () => ({ code: 'SESSION_EXPIRED' as const, message: 'Session timed out' }),
          }),
        },
      },
      on: {
        UI_START_SIGNING: {
          target: 'round1Collect',
          actions: assign({
            message: ({ event }) => event.message,
            selectedSignerIds: ({ event }) => event.signerIds,
            messageId: ({ event }) => event.messageId,
            backendId: ({ event }) => event.backendId,
            publicKeyPackage: ({ event }) => event.publicKeyPackage,
            groupPublicKey: ({ event }) => event.groupPublicKey,
            commitments: () => new Map(),
            signatureShares: () => new Map(),
            phase: () => 'round1' as ProtocolPhase,
          }),
        },
        UI_CANCEL: { target: 'closing' },
      },
    },

    round1Collect: {
      after: {
        120000: [ // ROUND1_TIMEOUT
          {
            target: 'failed',
            guard: ({ context }) => context.commitments.size < context.threshold,
            actions: assign({
              error: () => ({ code: 'ROUND1_TIMEOUT' as const, message: 'Round 1 timed out' }),
            }),
          },
          { target: 'creatingSigningPackage' },
        ],
      },
      on: {
        RX_ROUND1_COMMITMENT: {
          guard: ({ context, event }) => context.selectedSignerIds.includes(event.participantId),
          actions: assign({
            commitments: ({ context, event }) => {
              const newMap = new Map(context.commitments);
              newMap.set(event.participantId, {
                participantId: event.participantId,
                hiding: event.hiding,
                binding: event.binding,
              });
              return newMap;
            },
          }),
        },
        RX_ABORT: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'ABORTED' as const,
              message: event.message,
              details: { reason: event.reason },
            }),
          }),
        },
        UI_CANCEL: { target: 'aborting' },
      },
      always: {
        target: 'creatingSigningPackage',
        guard: ({ context }) => context.commitments.size >= context.selectedSignerIds.length,
      },
    },

    creatingSigningPackage: {
      invoke: {
        id: 'createSigningPackage',
        src: createSigningPackageActor,
        input: ({ context }) => ({
          message: context.message!,
          commitments: Array.from(context.commitments.values()),
          publicKeyPackage: context.publicKeyPackage || undefined,
        }),
        onDone: {
          target: 'round2Send',
          actions: assign({
            signingPackage: ({ event }) => event.output.signingPackage,
            randomizer: ({ event }) => event.output.randomizer,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'AGGREGATION_FAILED' as const,
              message: `Failed to create signing package: ${event.error}`,
            }),
          }),
        },
      },
      on: { UI_CANCEL: { target: 'aborting' } },
    },

    round2Send: {
      entry: assign({ phase: () => 'commitments_sent' as ProtocolPhase }),
      invoke: {
        id: 'sendCommitmentsSet',
        src: sendMessageActor,
        input: ({ context }) => {
          // Convert internal commitments to WasmCommitment wire format
          const wasmCommitments = Array.from(context.commitments.values()).map((c) => ({
            identifier: c.participantId,
            commitment: JSON.stringify({ hiding: c.hiding, binding: c.binding }),
          }));
          return {
            sessionId: context.sessionId!,
            message: createCommitmentsSet(
              context.sessionId!,
              context.coordinatorPubkey,
              context.messageId!,  // Generated in UI_START_SIGNING
              wasmCommitments,
              context.signingPackage || '',  // Set by useSigning after calling backend.createSigningPackage()
              context.randomizer || '',       // Set by useSigning after calling backend.createSigningPackage()
              context.groupPublicKey || ''    // Set from stored group's publicKeyPackage
            ),
            recipients: context.participantPubkeys.filter((p) => p !== context.coordinatorPubkey),
          };
        },
        onDone: { target: 'round2Collect' },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'THRESHOLD_NOT_MET' as const,
              message: `Failed to send: ${event.error}`,
            }),
          }),
        },
      },
      on: { UI_CANCEL: { target: 'aborting' } },
    },

    round2Collect: {
      entry: assign({
        phase: () => 'round2' as ProtocolPhase,
        signatureShares: () => new Map(),
      }),
      after: {
        120000: [ // ROUND2_TIMEOUT
          {
            target: 'failed',
            guard: ({ context }) => context.signatureShares.size < context.threshold,
            actions: assign({
              error: () => ({ code: 'ROUND2_TIMEOUT' as const, message: 'Round 2 timed out' }),
            }),
          },
          { target: 'aggregating' },
        ],
      },
      on: {
        RX_ROUND2_SIGNATURE_SHARE: {
          guard: ({ context, event }) =>
            context.selectedSignerIds.includes(event.participantId) &&
            context.commitments.has(event.participantId),
          actions: assign({
            signatureShares: ({ context, event }) => {
              const newMap = new Map(context.signatureShares);
              newMap.set(event.participantId, {
                participantId: event.participantId,
                share: event.share,
              });
              return newMap;
            },
          }),
        },
        RX_ABORT: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'ABORTED' as const,
              message: event.message,
            }),
          }),
        },
        UI_CANCEL: { target: 'aborting' },
      },
      always: {
        target: 'aggregating',
        guard: ({ context }) => context.signatureShares.size >= context.selectedSignerIds.length,
      },
    },

    aggregating: {
      invoke: {
        id: 'aggregateSignature',
        src: aggregateSignatureActor,
        input: ({ context }) => ({
          message: context.message!,
          commitments: Array.from(context.commitments.values()),
          shares: Array.from(context.signatureShares.values()),
          publicKeyPackage: context.publicKeyPackage || '',
          randomizer: context.randomizer || undefined,
        }),
        onDone: {
          target: 'broadcasting',
          actions: assign({
            aggregateSignature: ({ event }) => event.output.signature,
            verified: ({ event }) => event.output.verified,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'AGGREGATION_FAILED' as const,
              message: String(event.error),
            }),
            abortReason: () => 'aggregation_failed' as AbortReason,
          }),
        },
      },
    },

    broadcasting: {
      invoke: {
        id: 'sendSignatureResult',
        src: sendMessageActor,
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          message: createSignatureResult(
            context.sessionId!,
            context.coordinatorPubkey,
            context.messageId!,  // Generated in UI_START_SIGNING
            context.backendId,
            context.aggregateSignature!,
            context.groupPublicKey || '',
            context.verified,
            context.randomizer || undefined
          ),
          recipients: context.participantPubkeys.filter((p) => p !== context.coordinatorPubkey),
        }),
        onDone: { target: 'complete' },
        onError: { target: 'complete' }, // Still complete - signature is valid
      },
    },

    complete: {
      type: 'final',
      entry: assign({ phase: () => 'complete' as ProtocolPhase }),
    },

    aborting: {
      invoke: {
        id: 'sendAbort',
        src: sendMessageActor,
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          message: createAbort(
            context.sessionId!,
            context.coordinatorPubkey,
            context.abortReason ?? 'user_cancelled',
            context.error?.message ?? 'Ceremony aborted',
            context.messageId || undefined,
            context.error?.details
          ),
          recipients: context.participantPubkeys.filter((p) => p !== context.coordinatorPubkey),
        }),
        onDone: { target: 'closing' },
        onError: { target: 'closing' },
      },
    },

    failed: {
      on: {
        UI_RESET: {
          target: 'idle',
          actions: assign(({ context }) => createInitialCoordinatorContext(context.coordinatorPubkey)),
        },
        UI_CANCEL: { target: 'closing' },
      },
    },

    closing: {
      invoke: {
        id: 'closeSession',
        src: closeSessionActor,
        input: ({ context }) => ({ sessionId: context.sessionId! }),
        onDone: {
          target: 'idle',
          actions: assign(({ context }) => createInitialCoordinatorContext(context.coordinatorPubkey)),
        },
        onError: {
          target: 'idle',
          actions: assign(({ context }) => createInitialCoordinatorContext(context.coordinatorPubkey)),
        },
      },
    },
  },
});

export type CoordinatorMachine = typeof coordinatorMachine;
export type CoordinatorActor = ActorRefFrom<typeof coordinatorMachine>;
export type CoordinatorSnapshot = ReturnType<typeof coordinatorMachine.getInitialSnapshot>;
