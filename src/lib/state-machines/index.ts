/**
 * State Machines for FROST Signing Ceremonies
 *
 * XState machines for managing coordinator and participant flows.
 */

// Coordinator machine
export {
  coordinatorMachine,
  type CoordinatorMachine,
  type CoordinatorContext,
  type CoordinatorEvent,
  type CoordinatorState,
  // Actor creators for dependency injection
  createSessionActor,
  startSigningActor,
  aggregateSignatureActor,
  closeSessionActor,
} from './coordinator-machine';

// Participant machine
export {
  participantMachine,
  type ParticipantMachine,
  type ParticipantContext,
  type ParticipantEvent,
  type ParticipantState,
  type TransactionDetails,
  // Actor creators for dependency injection
  joinSessionActor,
  generateNoncesActor,
  sendCommitmentActor,
  parseTransactionActor,
  generateSignatureShareActor,
  sendSignatureShareActor,
  leaveSessionActor,
} from './participant-machine';
