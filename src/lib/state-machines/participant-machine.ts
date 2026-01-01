/**
 * Participant State Machine
 *
 * Manages the signing ceremony flow for participants.
 * States: idle → joiningSession → waitingForRound1Start → sendingRound1 →
 *         waitingForRound2 → confirmingTransaction → sendingRound2 → complete
 */

import { setup, assign, fromPromise } from 'xstate';
import type {
  SessionId,
  SessionInfo,
  SigningCommitment,
  SigningNonces,
  FrostSignatureShare,
  FrostKeyPackage,
  ParticipantId,
  FrostError,
  AggregateSignature,
} from '@/types';

// =============================================================================
// Types
// =============================================================================

export interface TransactionDetails {
  /** Raw message being signed (hex) */
  message: string;
  /** Human-readable description */
  description: string;
  /** Parsed transaction info (if applicable) */
  txInfo?: {
    type: 'zcash_transaction' | 'message' | 'unknown';
    inputs?: Array<{ amount: bigint; source: string }>;
    outputs?: Array<{ amount: bigint; destination: string; memo?: string }>;
    fee?: bigint;
  };
}

export interface ParticipantContext {
  // Session info
  sessionId: SessionId | null;
  session: SessionInfo | null;
  participantId: ParticipantId | null;
  inviteCode: string | null;

  // Key material
  keyPackage: FrostKeyPackage | null;

  // Round 1 state
  nonces: SigningNonces | null;
  commitment: SigningCommitment | null;
  allCommitments: SigningCommitment[];

  // Transaction confirmation
  transactionDetails: TransactionDetails | null;
  userConfirmed: boolean;

  // Round 2 state
  signatureShare: FrostSignatureShare | null;
  aggregateSignature: AggregateSignature | null;

  // Error handling
  error: FrostError | null;
  retryCount: number;
  maxRetries: number;

  // Timeouts
  roundTimeout: number; // ms
}

export type ParticipantEvent =
  | { type: 'JOIN'; sessionId: SessionId; inviteCode: string; keyPackage: FrostKeyPackage }
  | { type: 'SESSION_JOINED'; session: SessionInfo; participantId: ParticipantId }
  | { type: 'ROUND1_STARTED'; message: string }
  | { type: 'NONCES_GENERATED'; nonces: SigningNonces; commitment: SigningCommitment }
  | { type: 'COMMITMENT_SENT' }
  | { type: 'COMMITMENTS_RECEIVED'; commitments: SigningCommitment[] }
  | { type: 'TRANSACTION_PARSED'; details: TransactionDetails }
  | { type: 'CONFIRM_TRANSACTION' }
  | { type: 'REJECT_TRANSACTION' }
  | { type: 'SIGNATURE_SHARE_GENERATED'; share: FrostSignatureShare }
  | { type: 'SIGNATURE_SHARE_SENT' }
  | { type: 'SIGNING_COMPLETE'; signature: AggregateSignature }
  | { type: 'SESSION_CLOSED' }
  | { type: 'TIMEOUT' }
  | { type: 'ERROR'; error: FrostError }
  | { type: 'RETRY' }
  | { type: 'LEAVE' }
  | { type: 'RESET' };

// =============================================================================
// Initial Context
// =============================================================================

const initialContext: ParticipantContext = {
  sessionId: null,
  session: null,
  participantId: null,
  inviteCode: null,
  keyPackage: null,
  nonces: null,
  commitment: null,
  allCommitments: [],
  transactionDetails: null,
  userConfirmed: false,
  signatureShare: null,
  aggregateSignature: null,
  error: null,
  retryCount: 0,
  maxRetries: 3,
  roundTimeout: 120000, // 2 minutes
};

// =============================================================================
// Actor Logic (Services)
// =============================================================================

export const joinSessionActor = fromPromise<
  { session: SessionInfo; participantId: ParticipantId },
  { sessionId: SessionId; inviteCode: string }
>(async ({ input }) => {
  throw new Error('joinSessionActor must be provided via machine options');
});

export const generateNoncesActor = fromPromise<
  { nonces: SigningNonces; commitment: SigningCommitment },
  { keyPackage: FrostKeyPackage; participantId: ParticipantId }
>(async ({ input }) => {
  throw new Error('generateNoncesActor must be provided via machine options');
});

export const sendCommitmentActor = fromPromise<
  void,
  { sessionId: SessionId; commitment: SigningCommitment }
>(async ({ input }) => {
  throw new Error('sendCommitmentActor must be provided via machine options');
});

export const parseTransactionActor = fromPromise<
  TransactionDetails,
  { message: string }
>(async ({ input }) => {
  throw new Error('parseTransactionActor must be provided via machine options');
});

export const generateSignatureShareActor = fromPromise<
  FrostSignatureShare,
  {
    keyPackage: FrostKeyPackage;
    nonces: SigningNonces;
    commitments: SigningCommitment[];
    message: string;
    participantId: ParticipantId;
  }
>(async ({ input }) => {
  throw new Error('generateSignatureShareActor must be provided via machine options');
});

export const sendSignatureShareActor = fromPromise<
  void,
  { sessionId: SessionId; share: FrostSignatureShare }
>(async ({ input }) => {
  throw new Error('sendSignatureShareActor must be provided via machine options');
});

export const leaveSessionActor = fromPromise<void, { sessionId: SessionId }>(
  async ({ input }) => {
    throw new Error('leaveSessionActor must be provided via machine options');
  }
);

// =============================================================================
// State Machine
// =============================================================================

export const participantMachine = setup({
  types: {
    context: {} as ParticipantContext,
    events: {} as ParticipantEvent,
  },
  actors: {
    joinSession: joinSessionActor,
    generateNonces: generateNoncesActor,
    sendCommitment: sendCommitmentActor,
    parseTransaction: parseTransactionActor,
    generateSignatureShare: generateSignatureShareActor,
    sendSignatureShare: sendSignatureShareActor,
    leaveSession: leaveSessionActor,
  },
  actions: {
    setJoinParams: assign({
      sessionId: ({ event }) => {
        if (event.type === 'JOIN') return event.sessionId;
        return null;
      },
      inviteCode: ({ event }) => {
        if (event.type === 'JOIN') return event.inviteCode;
        return null;
      },
      keyPackage: ({ event }) => {
        if (event.type === 'JOIN') return event.keyPackage;
        return null;
      },
    }),
    setSessionInfo: assign({
      session: ({ event }) => {
        if (event.type === 'SESSION_JOINED') return event.session;
        return null;
      },
      participantId: ({ event }) => {
        if (event.type === 'SESSION_JOINED') return event.participantId;
        return null;
      },
    }),
    setNonces: assign({
      nonces: ({ event }) => {
        if (event.type === 'NONCES_GENERATED') return event.nonces;
        return null;
      },
      commitment: ({ event }) => {
        if (event.type === 'NONCES_GENERATED') return event.commitment;
        return null;
      },
    }),
    setAllCommitments: assign({
      allCommitments: ({ event }) => {
        if (event.type === 'COMMITMENTS_RECEIVED') return event.commitments;
        return [];
      },
    }),
    setTransactionDetails: assign({
      transactionDetails: ({ event }) => {
        if (event.type === 'TRANSACTION_PARSED') return event.details;
        return null;
      },
    }),
    confirmTransaction: assign({
      userConfirmed: () => true,
    }),
    setSignatureShare: assign({
      signatureShare: ({ event }) => {
        if (event.type === 'SIGNATURE_SHARE_GENERATED') return event.share;
        return null;
      },
    }),
    setAggregateSignature: assign({
      aggregateSignature: ({ event }) => {
        if (event.type === 'SIGNING_COMPLETE') return event.signature;
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
      nonces: () => null,
      commitment: () => null,
      allCommitments: () => [],
      signatureShare: () => null,
      userConfirmed: () => false,
      transactionDetails: () => null,
    }),
  },
  guards: {
    canRetry: ({ context }) => {
      return context.retryCount < context.maxRetries;
    },
    hasKeyPackage: ({ context }) => {
      return context.keyPackage !== null;
    },
    hasCommitment: ({ context }) => {
      return context.commitment !== null;
    },
    hasAllCommitments: ({ context }) => {
      return context.allCommitments.length > 0;
    },
    isConfirmed: ({ context }) => {
      return context.userConfirmed;
    },
  },
  delays: {
    ROUND_TIMEOUT: ({ context }) => context.roundTimeout,
  },
}).createMachine({
  id: 'participant',
  initial: 'idle',
  context: initialContext,

  states: {
    idle: {
      on: {
        JOIN: {
          target: 'joiningSession',
          actions: ['setJoinParams', 'clearError'],
        },
      },
    },

    joiningSession: {
      invoke: {
        id: 'joinSession',
        src: 'joinSession',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          inviteCode: context.inviteCode!,
        }),
        onDone: {
          target: 'waitingForRound1Start',
          actions: assign({
            session: ({ event }) => event.output.session,
            participantId: ({ event }) => event.output.participantId,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'SESSION_NOT_FOUND' as const,
              message: String(event.error),
            }),
          }),
        },
      },
    },

    waitingForRound1Start: {
      on: {
        ROUND1_STARTED: {
          target: 'generatingRound1',
          actions: assign({
            transactionDetails: ({ event }) => ({
              message: event.message,
              description: 'Parsing transaction...',
            }),
          }),
        },
        SESSION_CLOSED: {
          target: 'sessionClosed',
        },
        LEAVE: {
          target: 'leaving',
        },
      },
    },

    generatingRound1: {
      invoke: {
        id: 'generateNonces',
        src: 'generateNonces',
        input: ({ context }) => ({
          keyPackage: context.keyPackage!,
          participantId: context.participantId!,
        }),
        onDone: {
          target: 'sendingRound1',
          actions: assign({
            nonces: ({ event }) => event.output.nonces,
            commitment: ({ event }) => event.output.commitment,
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

    sendingRound1: {
      invoke: {
        id: 'sendCommitment',
        src: 'sendCommitment',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          commitment: context.commitment!,
        }),
        onDone: {
          target: 'waitingForRound2',
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'NETWORK_ERROR' as const,
              message: String(event.error),
            }),
          }),
        },
      },
      on: {
        COMMITMENT_SENT: {
          target: 'waitingForRound2',
        },
      },
    },

    waitingForRound2: {
      after: {
        ROUND_TIMEOUT: {
          target: 'timeout',
        },
      },
      on: {
        COMMITMENTS_RECEIVED: {
          target: 'parsingTransaction',
          actions: 'setAllCommitments',
        },
        SESSION_CLOSED: {
          target: 'sessionClosed',
        },
        LEAVE: {
          target: 'leaving',
        },
      },
    },

    parsingTransaction: {
      invoke: {
        id: 'parseTransaction',
        src: 'parseTransaction',
        input: ({ context }) => ({
          message: context.transactionDetails?.message ?? '',
        }),
        onDone: {
          target: 'confirmingTransaction',
          actions: assign({
            transactionDetails: ({ event }) => event.output,
          }),
        },
        onError: {
          // If parsing fails, still show for confirmation with raw data
          target: 'confirmingTransaction',
          actions: assign({
            transactionDetails: ({ context }) => ({
              message: context.transactionDetails?.message ?? '',
              description: 'Unknown transaction format',
              txInfo: { type: 'unknown' as const },
            }),
          }),
        },
      },
    },

    confirmingTransaction: {
      // User must explicitly confirm before signing
      on: {
        CONFIRM_TRANSACTION: {
          target: 'generatingRound2',
          actions: 'confirmTransaction',
        },
        REJECT_TRANSACTION: {
          target: 'leaving',
          actions: assign({
            error: () => ({
              code: 'NOT_AUTHORIZED' as const,
              message: 'User rejected the transaction',
            }),
          }),
        },
        SESSION_CLOSED: {
          target: 'sessionClosed',
        },
      },
    },

    generatingRound2: {
      invoke: {
        id: 'generateSignatureShare',
        src: 'generateSignatureShare',
        input: ({ context }) => ({
          keyPackage: context.keyPackage!,
          nonces: context.nonces!,
          commitments: context.allCommitments,
          message: context.transactionDetails?.message ?? '',
          participantId: context.participantId!,
        }),
        onDone: {
          target: 'sendingRound2',
          actions: assign({
            signatureShare: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'INVALID_SHARE' as const,
              message: String(event.error),
            }),
          }),
        },
      },
    },

    sendingRound2: {
      invoke: {
        id: 'sendSignatureShare',
        src: 'sendSignatureShare',
        input: ({ context }) => ({
          sessionId: context.sessionId!,
          share: context.signatureShare!,
        }),
        onDone: {
          target: 'waitingForCompletion',
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => ({
              code: 'NETWORK_ERROR' as const,
              message: String(event.error),
            }),
          }),
        },
      },
      on: {
        SIGNATURE_SHARE_SENT: {
          target: 'waitingForCompletion',
        },
      },
    },

    waitingForCompletion: {
      after: {
        ROUND_TIMEOUT: {
          target: 'timeout',
        },
      },
      on: {
        SIGNING_COMPLETE: {
          target: 'complete',
          actions: 'setAggregateSignature',
        },
        SESSION_CLOSED: {
          target: 'sessionClosed',
        },
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },

    complete: {
      type: 'final',
    },

    timeout: {
      on: {
        RETRY: [
          {
            target: 'waitingForRound1Start',
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
        LEAVE: {
          target: 'leaving',
        },
      },
    },

    error: {
      on: {
        RETRY: [
          {
            target: 'waitingForRound1Start',
            guard: 'canRetry',
            actions: ['incrementRetry', 'clearError', 'clearSigningState'],
          },
        ],
        LEAVE: {
          target: 'leaving',
        },
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },

    sessionClosed: {
      on: {
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },

    leaving: {
      invoke: {
        id: 'leaveSession',
        src: 'leaveSession',
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

export type ParticipantMachine = typeof participantMachine;
export type ParticipantState = ReturnType<typeof participantMachine.transition>;
