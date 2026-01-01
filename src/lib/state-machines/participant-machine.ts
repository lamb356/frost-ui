/**
 * Participant State Machine
 *
 * Manages the signing ceremony flow for participants.
 * States: idle → joiningSession → waitingForRound1Start → sendingRound1 →
 *         waitingForRound2 → confirmingTransaction → sendingRound2 → complete
 *
 * ## IMPORTANT: frostd Spec Compliance Notes
 *
 * The frostd specification (https://frost.zfnd.org/zcash/server.html) does NOT
 * define these concepts that this state machine currently uses:
 *
 * 1. **inviteCode**: The frostd spec has no invite code concept. Participants
 *    must know the session_id directly (shared out-of-band by coordinator).
 *    They must also be in the pubkeys list when the session was created.
 *    TODO: Remove inviteCode and accept session_id directly.
 *
 * 2. **"Joining" a session**: There is no explicit join operation in frostd.
 *    A participant is part of a session if their pubkey was included in the
 *    pubkeys list when /create_new_session was called. The participant
 *    "participates" by:
 *    - Polling /receive to get messages from coordinator
 *    - Sending Round 1 commitment via /send (recipients=[]) to coordinator
 *    - Receiving all commitments and message to sign
 *    - Sending Round 2 signature share via /send
 *
 * 3. **ROUND1_STARTED event**: The frostd server does not push events.
 *    Participants must poll /receive to detect when the coordinator has
 *    broadcast the message to sign. When they receive this message,
 *    they generate and send their Round 1 commitment.
 *
 * ## How This Machine Should Work with Real frostd
 *
 * 1. Participant receives session_id from coordinator (out-of-band)
 * 2. Participant polls /receive (as_coordinator=false) for incoming messages
 * 3. When message-to-sign arrives → generate Round 1 commitment
 * 4. Send commitment via /send with recipients=[] (to coordinator)
 * 5. Poll /receive for collected commitments from coordinator
 * 6. Generate Round 2 signature share and send via /send
 * 7. Poll /receive for final aggregate signature
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
  /**
   * DEMO ONLY: The frostd spec does NOT have an invite code concept.
   * Sessions are identified by session_id only. The coordinator shares
   * the session_id out-of-band. Participants must have their pubkey
   * in the session's pubkeys list to participate.
   * TODO: Remove this field and use session_id directly.
   */
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

/**
 * Participant events.
 *
 * NOTE: Many of these events are derived from polling /receive, not pushed by frostd.
 * - SESSION_JOINED: Derived locally after verifying our pubkey is in session info
 * - ROUND1_STARTED: Derived when message-to-sign is received via /receive
 * - COMMITMENTS_RECEIVED: Derived when all commitments are received via /receive
 * - SIGNING_COMPLETE: Derived when aggregate signature is received via /receive
 */
export type ParticipantEvent =
  /**
   * JOIN uses inviteCode which is NOT in frostd spec. In production, this
   * should accept only session_id. The participant verifies they're in the
   * session by checking if their pubkey is in the session's pubkeys list.
   */
  | { type: 'JOIN'; sessionId: SessionId; inviteCode: string; keyPackage: FrostKeyPackage }
  | { type: 'SESSION_JOINED'; session: SessionInfo; participantId: ParticipantId }
  /**
   * DERIVED EVENT: Fire this when message-to-sign is received via /receive polling.
   * frostd does not push "round started" events - participants must poll.
   */
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
