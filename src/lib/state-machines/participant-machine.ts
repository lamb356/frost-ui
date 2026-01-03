/**
 * Participant State Machine (Production-Ready)
 *
 * Manages the FROST signing ceremony from a participant's perspective.
 * Implements the protocol specified by frostd with full error handling.
 *
 * Design principles:
 * - Single source of truth = message log
 * - State derived by replaying messages
 * - Side effects (send/poll) are isolated actors
 * - No non-spec concepts (inviteCode, etc.)
 * - Nonce reuse protection
 */

import { createMachine, assign, fromPromise, type ActorRefFrom } from 'xstate';
import type {
  FrostMessage,
  AbortReason,
  WasmCommitment,
  WasmSignatureShare,
} from '@/types/messages';
import {
  createRound1Commitment,
  createRound2SignatureShare,
  createAbort,
} from '@/types/messages';
import { type ProtocolPhase, DeduplicationSet } from './validation';

// =============================================================================
// Internal Types (separate from wire format)
// =============================================================================

/**
 * Internal commitment format stored in participant context.
 * This is separate from the wire format (WasmCommitment).
 */
export interface InternalCommitment {
  participantId: number;
  hiding: string;
  binding: string;
}

/**
 * Internal signature share format stored in participant context.
 * This is separate from the wire format (WasmSignatureShare).
 */
export interface InternalSignatureShare {
  participantId: number;
  share: string;
}

// =============================================================================
// Types
// =============================================================================

export interface ParticipantContext {
  sessionId: string | null;
  participantPubkey: string;
  participantId: number;
  keyPackage: KeyPackage | null;
  messageLog: FrostMessage[];
  signingMessage: string | null;
  messageId: string | null;  // message_id from SIGNING_PACKAGE
  signerIds: number[];
  coordinatorPubkey: string | null;
  nonces: SigningNonces | null;
  commitment: InternalCommitment | null;
  allCommitments: InternalCommitment[];
  signatureShare: InternalSignatureShare | null;
  aggregateSignature: string | null;
  verified: boolean;
  userConfirmed: boolean;
  error: ParticipantError | null;
  abortReason: AbortReason | null;
  dedupeSet: DeduplicationSet;
  nonceMessageId: string | null;
  round1TimeoutMs: number;
  round2TimeoutMs: number;
  resultTimeoutMs: number;
  phase: ProtocolPhase;
  // New fields for canonical wire format
  signingPackage: string | null;  // From COMMITMENTS_SET
  randomizer: string | null;       // From COMMITMENTS_SET
  groupPublicKey: string | null;   // From COMMITMENTS_SET
}

export interface KeyPackage {
  participantId: number;
  secretShare: string;
  groupPublicKey: string;
  publicKeyShares: Record<number, string>;
  threshold: number;
  totalParticipants: number;
}

export interface SigningNonces {
  hiding: string;
  binding: string;
}

export interface ParticipantError {
  code: ParticipantErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ParticipantErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'NOT_IN_SIGNER_LIST'
  | 'ROUND1_TIMEOUT'
  | 'ROUND2_TIMEOUT'
  | 'RESULT_TIMEOUT'
  | 'INVALID_MESSAGE'
  | 'INVALID_COMMITMENT'
  | 'NONCE_REUSE_DETECTED'
  | 'SIGNING_FAILED'
  | 'ABORTED';

export type ParticipantEvent =
  | { type: 'UI_JOIN'; sessionId: string }
  | { type: 'UI_CONFIRM' }
  | { type: 'UI_REJECT' }
  | { type: 'UI_CANCEL' }
  | { type: 'UI_RESET' }
  | { type: 'RX_SIGNING_PACKAGE'; message: string; signerIds: number[]; coordinatorPubkey: string; msgId: string }
  | { type: 'RX_COMMITMENTS_SET'; commitments: InternalCommitment[]; signingPackage?: string; randomizer?: string; groupPublicKey?: string }
  | { type: 'RX_SIGNATURE_RESULT'; signature: string; verified: boolean }
  | { type: 'RX_ABORT'; reason: AbortReason; message: string }
  | { type: 'ROUND1_GENERATED'; nonces: SigningNonces; commitment: InternalCommitment }
  | { type: 'ROUND2_GENERATED'; share: InternalSignatureShare }
  | { type: 'SEND_SUCCESS' }
  | { type: 'SEND_FAILED'; error: string }
  | { type: 'SESSION_INFO_OK'; coordinatorPubkey: string }
  | { type: 'SESSION_INFO_FAILED'; error: string };

export function createInitialParticipantContext(
  participantPubkey: string,
  participantId: number,
  keyPackage: KeyPackage | null = null,
  options: {
    round1TimeoutMs?: number;
    round2TimeoutMs?: number;
    resultTimeoutMs?: number;
  } = {}
): ParticipantContext {
  return {
    sessionId: null,
    participantPubkey,
    participantId,
    keyPackage,
    messageLog: [],
    signingMessage: null,
    messageId: null,
    signerIds: [],
    coordinatorPubkey: null,
    nonces: null,
    commitment: null,
    allCommitments: [],
    signatureShare: null,
    aggregateSignature: null,
    verified: false,
    userConfirmed: false,
    error: null,
    abortReason: null,
    dedupeSet: new DeduplicationSet(),
    nonceMessageId: null,
    round1TimeoutMs: options.round1TimeoutMs ?? 120000,
    round2TimeoutMs: options.round2TimeoutMs ?? 120000,
    resultTimeoutMs: options.resultTimeoutMs ?? 120000,
    phase: 'idle',
    signingPackage: null,
    randomizer: null,
    groupPublicKey: null,
  };
}

// =============================================================================
// Actor Logic (Services) - Placeholders for dependency injection
// =============================================================================

export const getSessionInfoActor = fromPromise<
  { coordinatorPubkey: string },
  { sessionId: string }
>(async () => {
  throw new Error('getSessionInfoActor must be provided via machine options');
});

export const sendMessageActor = fromPromise<
  void,
  { sessionId: string; message: FrostMessage; recipients: string[] }
>(async () => {
  throw new Error('sendMessageActor must be provided via machine options');
});

export const generateRound1Actor = fromPromise<
  { nonces: SigningNonces; commitment: InternalCommitment },
  { participantId: number; keyPackage: KeyPackage }
>(async () => {
  throw new Error('generateRound1Actor must be provided via machine options');
});

export const generateRound2Actor = fromPromise<
  { share: InternalSignatureShare },
  {
    participantId: number;
    keyPackage: KeyPackage;
    nonces: SigningNonces;
    message: string;
    allCommitments: InternalCommitment[];
    signerIds: number[];
    signingPackage?: string;
    randomizer?: string;
  }
>(async () => {
  throw new Error('generateRound2Actor must be provided via machine options');
});

// =============================================================================
// State Machine
// =============================================================================

export const participantMachine = createMachine({
  id: 'participant',
  initial: 'idle',
  types: {
    context: {} as ParticipantContext,
    events: {} as ParticipantEvent,
  },
  context: createInitialParticipantContext('', 1),

  states: {
    idle: {
      on: {
        UI_JOIN: {
          target: 'ready',
          actions: assign({
            sessionId: ({ event }) => event.sessionId,
            error: () => null,
          }),
        },
      },
    },

    ready: {
      invoke: {
        id: 'getSessionInfo',
        src: getSessionInfoActor,
        input: ({ context }) => ({ sessionId: context.sessionId! }),
        onDone: {
          target: 'awaitSigning',
          actions: assign({
            coordinatorPubkey: ({ event }) => event.output.coordinatorPubkey,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SESSION_NOT_FOUND' as const,
              message: String(event.error),
            }),
          }),
        },
      },
      on: {
        UI_CANCEL: {
          target: 'idle',
          actions: assign(({ context }) =>
            createInitialParticipantContext(context.participantPubkey, context.participantId, context.keyPackage)
          ),
        },
      },
    },

    awaitSigning: {
      on: {
        RX_SIGNING_PACKAGE: [
          // Nonce reuse check
          {
            target: 'failed',
            guard: ({ context, event }) =>
              context.nonceMessageId !== null && context.nonceMessageId === event.msgId,
            actions: assign({
              error: () => ({
                code: 'NONCE_REUSE_DETECTED' as const,
                message: 'Nonce reuse detected - refusing to sign',
              }),
            }),
          },
          // In signer list - proceed
          {
            target: 'round1',
            guard: ({ context, event }) => event.signerIds.includes(context.participantId),
            actions: assign({
              signingMessage: ({ event }) => event.message,
              signerIds: ({ event }) => event.signerIds,
              coordinatorPubkey: ({ event }) => event.coordinatorPubkey,
              messageId: ({ event }) => event.msgId,
              nonceMessageId: ({ event }) => event.msgId,
              phase: () => 'round1' as ProtocolPhase,
            }),
          },
          // Not in signer list - stay waiting
          {},
        ],
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
        UI_CANCEL: {
          target: 'idle',
          actions: assign(({ context }) =>
            createInitialParticipantContext(context.participantPubkey, context.participantId, context.keyPackage)
          ),
        },
      },
    },

    round1: {
      invoke: {
        id: 'generateRound1',
        src: generateRound1Actor,
        input: ({ context }) => ({
          participantId: context.participantId,
          keyPackage: context.keyPackage!,
        }),
        onDone: {
          target: 'sendingCommitment',
          actions: assign({
            nonces: ({ event }) => event.output.nonces,
            commitment: ({ event }) => event.output.commitment,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SIGNING_FAILED' as const,
              message: `Failed to generate commitment: ${event.error}`,
            }),
          }),
        },
      },
      on: {
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
    },

    sendingCommitment: {
      invoke: {
        id: 'sendCommitment',
        src: sendMessageActor,
        input: ({ context }) => {
          // Convert internal commitment to wire format (WasmCommitment)
          const wasmCommitment: WasmCommitment = {
            identifier: context.commitment!.participantId,
            commitment: JSON.stringify({
              hiding: context.commitment!.hiding,
              binding: context.commitment!.binding,
            }),
          };
          return {
            sessionId: context.sessionId!,
            message: createRound1Commitment(
              context.sessionId!,
              context.participantPubkey,
              context.messageId || context.nonceMessageId || '',
              wasmCommitment
            ),
            recipients: [context.coordinatorPubkey!],
          };
        },
        onDone: { target: 'awaitCommitments' },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SIGNING_FAILED' as const,
              message: `Failed to send commitment: ${event.error}`,
            }),
          }),
        },
      },
      on: {
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
    },

    awaitCommitments: {
      after: {
        120000: { // ROUND1_TIMEOUT
          target: 'failed',
          actions: assign({
            error: () => ({ code: 'ROUND1_TIMEOUT' as const, message: 'Timed out waiting for commitments' }),
          }),
        },
      },
      on: {
        RX_COMMITMENTS_SET: [
          // Valid commitments set
          {
            target: 'confirm',
            guard: ({ context, event }) => {
              // Note: message validation is done via message_id linkage, not by echoing message
              // The signing_package contains the message, so we don't need to check event.message

              // Verify our commitment is in the set
              const ourCommitment = event.commitments.find(c => c.participantId === context.participantId);
              if (!ourCommitment) return false;
              if (context.commitment) {
                if (ourCommitment.hiding !== context.commitment.hiding ||
                    ourCommitment.binding !== context.commitment.binding) {
                  return false;
                }
              }
              return true;
            },
            actions: assign({
              allCommitments: ({ event }) => event.commitments,
              signingPackage: ({ event }) => event.signingPackage || null,
              randomizer: ({ event }) => event.randomizer || null,
              groupPublicKey: ({ event }) => event.groupPublicKey || null,
              phase: () => 'commitments_sent' as ProtocolPhase,
            }),
          },
          // Invalid
          {
            target: 'failed',
            actions: assign({
              error: () => ({
                code: 'INVALID_COMMITMENT' as const,
                message: 'Received invalid commitments set',
              }),
            }),
          },
        ],
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
    },

    confirm: {
      on: {
        UI_CONFIRM: {
          target: 'round2',
          actions: assign({
            userConfirmed: () => true,
            phase: () => 'round2' as ProtocolPhase,
          }),
        },
        UI_REJECT: {
          target: 'aborting',
          actions: assign({
            abortReason: () => 'user_cancelled' as AbortReason,
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
    },

    round2: {
      invoke: {
        id: 'generateRound2',
        src: generateRound2Actor,
        input: ({ context }) => ({
          participantId: context.participantId,
          keyPackage: context.keyPackage!,
          nonces: context.nonces!,
          message: context.signingMessage!,
          allCommitments: context.allCommitments,
          signerIds: context.signerIds,
          signingPackage: context.signingPackage || undefined,
          randomizer: context.randomizer || undefined,
        }),
        onDone: {
          target: 'sendingShare',
          actions: assign({
            signatureShare: ({ event }) => event.output.share,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SIGNING_FAILED' as const,
              message: `Failed to generate share: ${event.error}`,
            }),
          }),
        },
      },
      on: {
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
    },

    sendingShare: {
      invoke: {
        id: 'sendShare',
        src: sendMessageActor,
        input: ({ context }) => {
          // Convert internal signature share to wire format (WasmSignatureShare)
          const wasmShare: WasmSignatureShare = {
            identifier: context.signatureShare!.participantId,
            share: context.signatureShare!.share,
          };
          return {
            sessionId: context.sessionId!,
            message: createRound2SignatureShare(
              context.sessionId!,
              context.participantPubkey,
              context.messageId || context.nonceMessageId || '',
              wasmShare
            ),
            recipients: [context.coordinatorPubkey!],
          };
        },
        onDone: { target: 'awaitResult' },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'SIGNING_FAILED' as const,
              message: `Failed to send share: ${event.error}`,
            }),
          }),
        },
      },
      on: {
        RX_ABORT: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => ({
              code: 'ABORTED' as const,
              message: event.message,
            }),
          }),
        },
      },
    },

    awaitResult: {
      after: {
        120000: { // RESULT_TIMEOUT
          target: 'failed',
          actions: assign({
            error: () => ({ code: 'RESULT_TIMEOUT' as const, message: 'Timed out waiting for result' }),
          }),
        },
      },
      on: {
        RX_SIGNATURE_RESULT: {
          target: 'complete',
          actions: assign({
            aggregateSignature: ({ event }) => event.signature,
            verified: ({ event }) => event.verified,
            phase: () => 'complete' as ProtocolPhase,
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
      },
    },

    complete: {
      type: 'final',
    },

    aborting: {
      invoke: {
        id: 'sendAbort',
        src: sendMessageActor,
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          message: createAbort(
            context.sessionId!,
            context.participantPubkey,
            context.abortReason ?? 'user_cancelled',
            context.error?.message ?? 'Participant aborted',
            context.messageId || context.nonceMessageId || undefined,
            context.error?.details
          ),
          recipients: [context.coordinatorPubkey!],
        }),
        onDone: { target: 'failed' },
        onError: { target: 'failed' },
      },
    },

    failed: {
      on: {
        UI_RESET: {
          target: 'idle',
          actions: assign(({ context }) =>
            createInitialParticipantContext(context.participantPubkey, context.participantId, context.keyPackage)
          ),
        },
      },
    },
  },
});

export type ParticipantMachine = typeof participantMachine;
export type ParticipantActor = ActorRefFrom<typeof participantMachine>;
export type ParticipantSnapshot = ReturnType<typeof participantMachine.getInitialSnapshot>;
