/**
 * State Machines for FROST Signing Ceremonies
 *
 * Production-ready XState machines for managing coordinator and participant flows.
 *
 * Design principles:
 * - Single source of truth = message log
 * - Machines derive state by replaying messages
 * - Side effects (send/poll) are isolated actors
 * - No non-spec concepts (inviteCode, etc.)
 */

// =============================================================================
// Coordinator Machine
// =============================================================================

export {
  coordinatorMachine,
  createInitialCoordinatorContext,
  type CoordinatorMachine,
  type CoordinatorContext,
  type CoordinatorEvent,
  type CoordinatorActor,
  type CoordinatorSnapshot,
  type CoordinatorError,
  type CoordinatorErrorCode,
  // Actor creators for dependency injection
  createSessionActor,
  sendMessageActor as coordinatorSendMessageActor,
  aggregateSignatureActor,
  closeSessionActor,
} from './coordinator-machine';

// =============================================================================
// Participant Machine
// =============================================================================

export {
  participantMachine,
  createInitialParticipantContext,
  type ParticipantMachine,
  type ParticipantContext,
  type ParticipantEvent,
  type ParticipantActor,
  type ParticipantSnapshot,
  type ParticipantError,
  type ParticipantErrorCode,
  type KeyPackage,
  type SigningNonces,
  // Actor creators for dependency injection
  getSessionInfoActor,
  sendMessageActor as participantSendMessageActor,
  generateRound1Actor,
  generateRound2Actor,
} from './participant-machine';

// =============================================================================
// Validation
// =============================================================================

export {
  // Validation functions
  validateEnvelope,
  validateFreshness,
  validateSessionBinding,
  validateMessage,
  validatePayload,
  validateSigningPackage,
  validateRound1Commitment,
  validateCommitmentsSet,
  validateRound2SignatureShare,
  validateSignatureResult,
  validateAbort,
  // Phase checking
  isValidForPhase,
  type ProtocolPhase,
  // Deduplication
  DeduplicationSet,
  // Nonce tracking
  NonceTracker,
  // Configuration constants
  MAX_MESSAGE_AGE_MS,
  MAX_FUTURE_MS,
  // Types
  type ValidationResult,
  type ValidationError,
  type ValidationErrorCode,
} from './validation';
