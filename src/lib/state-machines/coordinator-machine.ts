/**
 * Coordinator State Machine
 *
 * Manages the signing ceremony flow for the coordinator role.
 * States: idle → creatingSession → waitingForParticipants → collectingRound1 →
 *         sendingRound2 → collectingRound2 → aggregating → complete
 */

import { setup, assign, fromPromise } from 'xstate';
import type {
  SessionId,
  SessionInfo,
  SigningCommitment,
  FrostSignatureShare,
  AggregateSignature,
  ParticipantId,
  FrostError,
} from '@/types';

// =============================================================================
// Types
// =============================================================================

export interface CoordinatorContext {
  // Session info
  sessionId: SessionId | null;
  session: SessionInfo | null;
  inviteCode: string | null;

  // Configuration
  sessionName: string;
  threshold: number;
  maxParticipants: number;
  message: string | null;

  // Signing state
  selectedSigners: ParticipantId[];
  commitments: Map<ParticipantId, SigningCommitment>;
  signatureShares: Map<ParticipantId, FrostSignatureShare>;
  aggregateSignature: AggregateSignature | null;

  // Error handling
  error: FrostError | null;
  retryCount: number;
  maxRetries: number;

  // Timeouts
  participantTimeout: number; // ms
  roundTimeout: number; // ms
}

export type CoordinatorEvent =
  | { type: 'START'; sessionName: string; threshold: number; maxParticipants: number }
  | { type: 'SESSION_CREATED'; session: SessionInfo; inviteCode: string }
  | { type: 'PARTICIPANT_JOINED'; participantId: ParticipantId }
  | { type: 'PARTICIPANT_LEFT'; participantId: ParticipantId }
  | { type: 'START_SIGNING'; message: string; signerIds: ParticipantId[] }
  | { type: 'COMMITMENT_RECEIVED'; commitment: SigningCommitment }
  | { type: 'ALL_COMMITMENTS_RECEIVED' }
  | { type: 'ROUND2_STARTED' }
  | { type: 'SIGNATURE_SHARE_RECEIVED'; share: FrostSignatureShare }
  | { type: 'ALL_SHARES_RECEIVED' }
  | { type: 'SIGNATURE_AGGREGATED'; signature: AggregateSignature }
  | { type: 'TIMEOUT' }
  | { type: 'ERROR'; error: FrostError }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: CoordinatorContext = {
  sessionId: null,
  session: null,
  inviteCode: null,
  sessionName: '',
  threshold: 2,
  maxParticipants: 3,
  message: null,
  selectedSigners: [],
  commitments: new Map(),
  signatureShares: new Map(),
  aggregateSignature: null,
  error: null,
  retryCount: 0,
  maxRetries: 3,
  participantTimeout: 300000, // 5 minutes
  roundTimeout: 120000, // 2 minutes
};

// =============================================================================
// Actor Logic (Services)
// =============================================================================

export const createSessionActor = fromPromise<
  { session: SessionInfo; inviteCode: string },
  { sessionName: string; threshold: number; maxParticipants: number }
>(async ({ input }) => {
  // This will be connected to FrostClient.createSession()
  // For now, return a placeholder that will be replaced with actual implementation
  throw new Error('createSessionActor must be provided via machine options');
});

export const startSigningActor = fromPromise<
  void,
  { sessionId: SessionId; message: string; signerIds: ParticipantId[] }
>(async ({ input }) => {
  throw new Error('startSigningActor must be provided via machine options');
});

export const aggregateSignatureActor = fromPromise<
  AggregateSignature,
  { sessionId: SessionId }
>(async ({ input }) => {
  throw new Error('aggregateSignatureActor must be provided via machine options');
});

export const closeSessionActor = fromPromise<void, { sessionId: SessionId }>(
  async ({ input }) => {
    throw new Error('closeSessionActor must be provided via machine options');
  }
);

// =============================================================================
// State Machine
// =============================================================================

export const coordinatorMachine = setup({
  types: {
    context: {} as CoordinatorContext,
    events: {} as CoordinatorEvent,
  },
  actors: {
    createSession: createSessionActor,
    startSigning: startSigningActor,
    aggregateSignature: aggregateSignatureActor,
    closeSession: closeSessionActor,
  },
  actions: {
    setSessionConfig: assign({
      sessionName: ({ event }) => {
        if (event.type === 'START') return event.sessionName;
        return '';
      },
      threshold: ({ event }) => {
        if (event.type === 'START') return event.threshold;
        return 2;
      },
      maxParticipants: ({ event }) => {
        if (event.type === 'START') return event.maxParticipants;
        return 3;
      },
    }),
    setSession: assign({
      sessionId: ({ event }) => {
        if (event.type === 'SESSION_CREATED') return event.session.sessionId;
        return null;
      },
      session: ({ event }) => {
        if (event.type === 'SESSION_CREATED') return event.session;
        return null;
      },
      inviteCode: ({ event }) => {
        if (event.type === 'SESSION_CREATED') return event.inviteCode;
        return null;
      },
    }),
    setSigningParams: assign({
      message: ({ event }) => {
        if (event.type === 'START_SIGNING') return event.message;
        return null;
      },
      selectedSigners: ({ event }) => {
        if (event.type === 'START_SIGNING') return event.signerIds;
        return [];
      },
    }),
    addCommitment: assign({
      commitments: ({ context, event }) => {
        if (event.type === 'COMMITMENT_RECEIVED') {
          const newMap = new Map(context.commitments);
          newMap.set(event.commitment.participantId, event.commitment);
          return newMap;
        }
        return context.commitments;
      },
    }),
    addSignatureShare: assign({
      signatureShares: ({ context, event }) => {
        if (event.type === 'SIGNATURE_SHARE_RECEIVED') {
          const newMap = new Map(context.signatureShares);
          newMap.set(event.share.participantId, event.share);
          return newMap;
        }
        return context.signatureShares;
      },
    }),
    setAggregateSignature: assign({
      aggregateSignature: ({ event }) => {
        if (event.type === 'SIGNATURE_AGGREGATED') return event.signature;
        return null;
      },
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === 'ERROR') return event.error;
        return null;
      },
    }),
    clearError: assign({
      error: () => null,
    }),
    incrementRetry: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),
    resetRetryCount: assign({
      retryCount: () => 0,
    }),
    resetContext: assign(() => initialContext),
    clearSigningState: assign({
      commitments: () => new Map(),
      signatureShares: () => new Map(),
      aggregateSignature: () => null,
      message: () => null,
      selectedSigners: () => [],
    }),
  },
  guards: {
    hasEnoughParticipants: ({ context }) => {
      const participantCount = context.session?.participants.length ?? 0;
      return participantCount >= context.threshold;
    },
    hasAllCommitments: ({ context }) => {
      return context.commitments.size >= context.selectedSigners.length;
    },
    hasAllShares: ({ context }) => {
      return context.signatureShares.size >= context.selectedSigners.length;
    },
    canRetry: ({ context }) => {
      return context.retryCount < context.maxRetries;
    },
    isParticipantDrop: ({ context, event }) => {
      if (event.type !== 'PARTICIPANT_LEFT') return false;
      return context.selectedSigners.includes(event.participantId);
    },
  },
  delays: {
    PARTICIPANT_TIMEOUT: ({ context }) => context.participantTimeout,
    ROUND_TIMEOUT: ({ context }) => context.roundTimeout,
  },
}).createMachine({
  id: 'coordinator',
  initial: 'idle',
  context: initialContext,

  states: {
    idle: {
      on: {
        START: {
          target: 'creatingSession',
          actions: ['setSessionConfig', 'clearError'],
        },
      },
    },

    creatingSession: {
      invoke: {
        id: 'createSession',
        src: 'createSession',
        input: ({ context }) => ({
          sessionName: context.sessionName,
          threshold: context.threshold,
          maxParticipants: context.maxParticipants,
        }),
        onDone: {
          target: 'waitingForParticipants',
          actions: assign({
            sessionId: ({ event }) => event.output.session.sessionId,
            session: ({ event }) => event.output.session,
            inviteCode: ({ event }) => event.output.inviteCode,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'UNKNOWN_ERROR' as const,
              message: String(event.error),
            }),
          }),
        },
      },
    },

    waitingForParticipants: {
      after: {
        PARTICIPANT_TIMEOUT: {
          target: 'timeout',
        },
      },
      on: {
        PARTICIPANT_JOINED: {
          actions: assign({
            session: ({ context, event }) => {
              if (!context.session) return null;
              return {
                ...context.session,
                participants: [
                  ...context.session.participants,
                  {
                    pubkey: '',
                    participantId: event.participantId,
                    hasCommitment: false,
                    hasSignatureShare: false,
                    joinedAt: Date.now(),
                  },
                ],
              };
            },
          }),
        },
        PARTICIPANT_LEFT: {
          actions: assign({
            session: ({ context, event }) => {
              if (!context.session) return null;
              return {
                ...context.session,
                participants: context.session.participants.filter(
                  (p) => p.participantId !== event.participantId
                ),
              };
            },
          }),
        },
        START_SIGNING: {
          target: 'collectingRound1',
          guard: 'hasEnoughParticipants',
          actions: ['setSigningParams', 'resetRetryCount'],
        },
        CANCEL: {
          target: 'closing',
        },
      },
    },

    collectingRound1: {
      entry: assign({
        commitments: () => new Map(),
      }),
      invoke: {
        id: 'startSigning',
        src: 'startSigning',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          message: context.message!,
          signerIds: context.selectedSigners,
        }),
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'UNKNOWN_ERROR' as const,
              message: String(event.error),
            }),
          }),
        },
      },
      after: {
        ROUND_TIMEOUT: {
          target: 'timeout',
        },
      },
      on: {
        COMMITMENT_RECEIVED: {
          actions: 'addCommitment',
        },
        ALL_COMMITMENTS_RECEIVED: {
          target: 'sendingRound2',
          guard: 'hasAllCommitments',
        },
        PARTICIPANT_LEFT: [
          {
            target: 'error',
            guard: 'isParticipantDrop',
            actions: assign({
              error: () => ({
                code: 'THRESHOLD_NOT_MET' as const,
                message: 'A required signer left the session',
              }),
            }),
          },
        ],
        CANCEL: {
          target: 'closing',
        },
      },
      always: [
        {
          target: 'sendingRound2',
          guard: 'hasAllCommitments',
        },
      ],
    },

    sendingRound2: {
      // Broadcast commitments to all participants
      // This is handled by the UI connecting the event
      on: {
        ROUND2_STARTED: {
          target: 'collectingRound2',
        },
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
        CANCEL: {
          target: 'closing',
        },
      },
    },

    collectingRound2: {
      entry: assign({
        signatureShares: () => new Map(),
      }),
      after: {
        ROUND_TIMEOUT: {
          target: 'timeout',
        },
      },
      on: {
        SIGNATURE_SHARE_RECEIVED: {
          actions: 'addSignatureShare',
        },
        ALL_SHARES_RECEIVED: {
          target: 'aggregating',
          guard: 'hasAllShares',
        },
        PARTICIPANT_LEFT: [
          {
            target: 'error',
            guard: 'isParticipantDrop',
            actions: assign({
              error: () => ({
                code: 'THRESHOLD_NOT_MET' as const,
                message: 'A required signer left the session',
              }),
            }),
          },
        ],
        CANCEL: {
          target: 'closing',
        },
      },
      always: [
        {
          target: 'aggregating',
          guard: 'hasAllShares',
        },
      ],
    },

    aggregating: {
      invoke: {
        id: 'aggregateSignature',
        src: 'aggregateSignature',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
        }),
        onDone: {
          target: 'complete',
          actions: assign({
            aggregateSignature: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'INVALID_SIGNATURE' as const,
              message: String(event.error),
            }),
          }),
        },
      },
    },

    complete: {
      type: 'final',
      entry: assign({
        session: ({ context }) => {
          if (!context.session) return null;
          return { ...context.session, state: 'completed' as const };
        },
      }),
    },

    timeout: {
      on: {
        RETRY: [
          {
            target: 'collectingRound1',
            guard: 'canRetry',
            actions: ['incrementRetry', 'clearSigningState'],
          },
          {
            target: 'error',
            actions: assign({
              error: () => ({
                code: 'SESSION_EXPIRED' as const,
                message: 'Maximum retries exceeded',
              }),
            }),
          },
        ],
        CANCEL: {
          target: 'closing',
        },
      },
    },

    error: {
      on: {
        RETRY: [
          {
            target: 'waitingForParticipants',
            guard: 'canRetry',
            actions: ['incrementRetry', 'clearError', 'clearSigningState'],
          },
        ],
        CANCEL: {
          target: 'closing',
        },
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },

    closing: {
      invoke: {
        id: 'closeSession',
        src: 'closeSession',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
        }),
        onDone: {
          target: 'idle',
          actions: 'resetContext',
        },
        onError: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },
  },
});

export type CoordinatorMachine = typeof coordinatorMachine;
export type CoordinatorState = ReturnType<typeof coordinatorMachine.transition>;
