'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSigning, type SigningRole, type SigningPhase } from '@/lib/hooks';
import { useAuth } from '@/lib/hooks/useAuth';
import { getStoredFrostSharesInfo } from '@/lib/crypto/keystore';
import { getSupportedBackends, getBackendName, getBackendDescription } from '@/lib/frost-backend';
import type { BackendId } from '@/lib/frost-backend/types';

// =============================================================================
// Main Page Component
// =============================================================================

export default function SignPage() {
  const { isAuthenticated, isAuthenticating } = useAuth();
  const signing = useSigning();
  const [role, setRole] = useState<SigningRole | null>(null);

  // Handle role selection
  const selectRole = (selectedRole: SigningRole) => {
    setRole(selectedRole);
  };

  // Reset to role selection
  const resetRole = () => {
    signing.reset();
    setRole(null);
  };

  // Show loading while checking auth
  if (isAuthenticating) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth required message
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
            <p className="text-gray-400 mb-6">Please log in to participate in signing ceremonies.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Role selection
  if (!role) {
    return <RoleSelection onSelectRole={selectRole} />;
  }

  // Role-specific flows
  if (role === 'coordinator') {
    return <CoordinatorFlow signing={signing} onBack={resetRole} />;
  }

  return <ParticipantFlow signing={signing} onBack={resetRole} />;
}

// =============================================================================
// Role Selection
// =============================================================================

function RoleSelection({ onSelectRole }: { onSelectRole: (role: SigningRole) => void }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Sign Transaction</h1>
          <p className="text-gray-400 mt-2">Choose your role in the signing ceremony.</p>
        </div>

        <div className="grid gap-6">
          <button
            onClick={() => onSelectRole('coordinator')}
            className="group p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-amber-500/50 transition-all text-left"
          >
            <div className="w-16 h-16 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">I&apos;m the Coordinator</h3>
            <p className="text-gray-400 mb-4">
              Create a new signing session, specify participants, and coordinate the signing ceremony.
            </p>
            <span className="inline-flex items-center gap-2 text-amber-400 font-medium group-hover:gap-3 transition-all">
              Start as Coordinator
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </button>

          <button
            onClick={() => onSelectRole('participant')}
            className="group p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-blue-500/50 transition-all text-left"
          >
            <div className="w-16 h-16 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">I&apos;m a Participant</h3>
            <p className="text-gray-400 mb-4">
              Join an existing signing session and contribute your signature share.
            </p>
            <span className="inline-flex items-center gap-2 text-blue-400 font-medium group-hover:gap-3 transition-all">
              Join as Participant
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Coordinator Flow
// =============================================================================

interface FlowProps {
  signing: ReturnType<typeof useSigning>;
  onBack: () => void;
}

function CoordinatorFlow({ signing, onBack }: FlowProps) {
  const { state } = signing;

  // Get coordinator-specific phase display
  const getPhaseInfo = (phase: SigningPhase) => {
    const phases: Record<SigningPhase, { label: string; index: number }> = {
      idle: { label: 'Setup', index: 0 },
      setup: { label: 'Setup', index: 0 },
      creating_session: { label: 'Creating', index: 1 },
      waiting_for_participants: { label: 'Waiting', index: 2 },
      round1_collect: { label: 'Round 1', index: 3 },
      round1_send: { label: 'Round 1', index: 3 },
      round2_collect: { label: 'Round 2', index: 4 },
      round2_send: { label: 'Round 2', index: 4 },
      confirm: { label: 'Confirm', index: 3 },
      aggregating: { label: 'Aggregating', index: 5 },
      complete: { label: 'Complete', index: 6 },
      failed: { label: 'Failed', index: -1 },
    };
    return phases[phase] ?? { label: 'Unknown', index: -1 };
  };

  const phaseInfo = getPhaseInfo(state.phase);
  const steps = ['Setup', 'Creating', 'Waiting', 'Round 1', 'Round 2', 'Aggregating', 'Complete'];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Change Role
          </button>
          <h1 className="text-3xl font-bold text-white">Coordinator</h1>
          <p className="text-gray-400 mt-2">Coordinate a threshold signing ceremony.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, index) => {
            const isActive = index === phaseInfo.index;
            const isComplete = index < phaseInfo.index;

            return (
              <div key={step} className="flex items-center">
                <div
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-500 text-gray-900'
                      : isComplete
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {step}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${isComplete ? 'bg-amber-500' : 'bg-gray-800'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {(state.phase === 'idle' || state.phase === 'setup') && (
            <CoordinatorSetup signing={signing} />
          )}

          {state.phase === 'creating_session' && <CreatingSession />}

          {state.phase === 'waiting_for_participants' && (
            <CoordinatorWaiting signing={signing} />
          )}

          {(state.phase === 'round1_collect' || state.phase === 'round1_send') && (
            <CoordinatorRound1 signing={signing} />
          )}

          {(state.phase === 'round2_collect' || state.phase === 'round2_send') && (
            <CoordinatorRound2 signing={signing} />
          )}

          {state.phase === 'aggregating' && <Aggregating />}

          {state.phase === 'complete' && (
            <SigningComplete
              signature={state.signature}
              verified={state.verified}
              onReset={onBack}
            />
          )}

          {state.phase === 'failed' && (
            <SigningFailed error={state.error} onReset={onBack} />
          )}
        </div>
      </div>
    </div>
  );
}

function CoordinatorSetup({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const [backendId, setBackendId] = useState<BackendId>('ed25519');
  const [participantPubkeys, setParticipantPubkeys] = useState<string[]>(['']);
  const [threshold, setThreshold] = useState(2);

  const backends = getSupportedBackends();

  const addParticipant = () => {
    setParticipantPubkeys([...participantPubkeys, '']);
  };

  const updateParticipant = (index: number, value: string) => {
    const updated = [...participantPubkeys];
    updated[index] = value;
    setParticipantPubkeys(updated);
  };

  const removeParticipant = (index: number) => {
    setParticipantPubkeys(participantPubkeys.filter((_, i) => i !== index));
  };

  const validPubkeys = participantPubkeys.filter((p) => p.length === 64);
  const canStart = validPubkeys.length >= 1 && threshold <= validPubkeys.length + 1;

  const handleStart = () => {
    signing.startAsCoordinator(validPubkeys, threshold, backendId);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Session Setup</h2>

      {/* Backend Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Signature Algorithm
        </label>
        <div className="grid gap-3">
          {backends.map((id) => (
            <button
              key={id}
              onClick={() => setBackendId(id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                backendId === id
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-4 h-4 rounded-full border-2 ${
                    backendId === id ? 'border-amber-500 bg-amber-500' : 'border-gray-600'
                  }`}
                />
                <div>
                  <div className="font-medium text-white">{getBackendName(id)}</div>
                  <div className="text-sm text-gray-400">{getBackendDescription(id)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Threshold */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Signing Threshold
        </label>
        <input
          type="number"
          min={2}
          max={participantPubkeys.length + 1}
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value) || 2)}
          className="w-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
        />
        <p className="text-sm text-gray-400 mt-1">
          Minimum signers required (you + {threshold - 1} participants)
        </p>
      </div>

      {/* Participant Pubkeys */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-300">
            Participant Public Keys
          </label>
          <button
            onClick={addParticipant}
            className="text-sm text-amber-400 hover:text-amber-300"
          >
            + Add Participant
          </button>
        </div>
        <div className="space-y-3">
          {participantPubkeys.map((pubkey, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={pubkey}
                onChange={(e) => updateParticipant(index, e.target.value)}
                placeholder="64-character hex public key"
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
              {participantPubkeys.length > 1 && (
                <button
                  onClick={() => removeParticipant(index)}
                  className="px-3 text-red-400 hover:text-red-300"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400 mt-2">
          {validPubkeys.length} valid participant(s) + you = {validPubkeys.length + 1} total
        </p>
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Create Session
      </button>
    </div>
  );
}

function CreatingSession() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-xl font-semibold text-white mb-2">Creating Session</h2>
      <p className="text-gray-400">Connecting to frostd server...</p>
    </div>
  );
}

interface StoredGroupInfo {
  groupId: string;
  name: string;
  participantId: number;
  threshold: number;
  totalParticipants: number;
  groupPublicKey: string;
  publicKeyPackage?: string;
  createdAt: number;
}

function CoordinatorWaiting({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const { state } = signing;
  const [messageToSign, setMessageToSign] = useState('');
  const [signerIds, setSignerIds] = useState<number[]>([1, 2]);
  const [availableGroups, setAvailableGroups] = useState<StoredGroupInfo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Load available groups on mount
  useEffect(() => {
    const groups = getStoredFrostSharesInfo();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailableGroups(groups);
  }, []);

  // Auto-select first group when groups are loaded and nothing selected
  useEffect(() => {
    if (availableGroups.length > 0 && !selectedGroupId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupId(availableGroups[0].groupId);
    }
  }, [availableGroups, selectedGroupId]);

  const selectedGroup = availableGroups.find(g => g.groupId === selectedGroupId);
  const hasValidGroup = selectedGroup && selectedGroup.publicKeyPackage;
  const canStart = messageToSign.length >= 2 && hasValidGroup;

  const handleStart = () => {
    if (!selectedGroup) return;

    const publicKeyPackage = selectedGroup.publicKeyPackage || '';
    const groupPublicKey = selectedGroup.groupPublicKey;

    if (!publicKeyPackage) {
      console.warn('No publicKeyPackage for selected group - aggregation may fail');
    }

    signing.startSigning(messageToSign, signerIds, publicKeyPackage, groupPublicKey);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Session Ready</h2>

      {state.sessionId && (
        <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
          <p className="text-sm text-gray-400 mb-2">Session ID (share with participants)</p>
          <code className="text-amber-400 font-mono break-all">{state.sessionId}</code>
        </div>
      )}

      {/* Group Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Signing Group
        </label>
        {availableGroups.length === 0 ? (
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-yellow-400 text-sm">
              No groups found. Create a group first or import a key share.
            </p>
          </div>
        ) : (
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
          >
            {availableGroups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.name} ({group.threshold}/{group.totalParticipants})
                {!group.publicKeyPackage && ' ⚠️ No key package'}
              </option>
            ))}
          </select>
        )}
        {selectedGroup && (
          <div className="mt-2 p-3 rounded-lg bg-gray-800/50 text-xs">
            <p className="text-gray-400">
              Group Key: <span className="text-amber-400 font-mono">{selectedGroup.groupPublicKey.slice(0, 16)}...</span>
            </p>
            {!selectedGroup.publicKeyPackage && (
              <p className="text-yellow-400 mt-1">
                Warning: This group is missing publicKeyPackage. Signature aggregation may fail.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Message to Sign (Hex)
        </label>
        <textarea
          value={messageToSign}
          onChange={(e) => setMessageToSign(e.target.value)}
          placeholder="Transaction sighash or message in hex format..."
          rows={4}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono text-sm"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Signer IDs (comma-separated)
        </label>
        <input
          type="text"
          value={signerIds.join(', ')}
          onChange={(e) => {
            const ids = e.target.value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
            setSignerIds(ids);
          }}
          placeholder="1, 2, 3"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Start Signing Ceremony
      </button>
    </div>
  );
}

function CoordinatorRound1({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const { state } = signing;

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 1: Collecting Commitments</h2>
      <p className="text-gray-400 mb-6">Waiting for participants to send their commitments...</p>

      <div className="space-y-2 mb-6">
        {Array.from(state.participantStatuses.entries()).map(([id, status]) => (
          <div key={id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-medium">
              {id}
            </div>
            <span className="text-white">Participant {id}</span>
            <span className="ml-auto">
              {status === 'committed' || status === 'signed' ? (
                <span className="text-xs text-green-400">Committed</span>
              ) : (
                <span className="text-xs text-yellow-400 flex items-center gap-1">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Waiting...
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => signing.cancel()}
        className="w-full py-3 px-6 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-xl transition-colors"
      >
        Cancel Ceremony
      </button>
    </div>
  );
}

function CoordinatorRound2({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const { state } = signing;

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 2: Collecting Signature Shares</h2>
      <p className="text-gray-400 mb-6">Commitments broadcast. Waiting for signature shares...</p>

      <div className="space-y-2 mb-6">
        {Array.from(state.participantStatuses.entries()).map(([id, status]) => (
          <div key={id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-medium">
              {id}
            </div>
            <span className="text-white">Participant {id}</span>
            <span className="ml-auto">
              {status === 'signed' ? (
                <span className="text-xs text-green-400">Signed</span>
              ) : (
                <span className="text-xs text-yellow-400 flex items-center gap-1">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Signing...
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => signing.cancel()}
        className="w-full py-3 px-6 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-xl transition-colors"
      >
        Cancel Ceremony
      </button>
    </div>
  );
}

function Aggregating() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-xl font-semibold text-white mb-2">Aggregating Signature</h2>
      <p className="text-gray-400">Combining signature shares...</p>
    </div>
  );
}

// =============================================================================
// Participant Flow
// =============================================================================

function ParticipantFlow({ signing, onBack }: FlowProps) {
  const { state } = signing;

  const getPhaseInfo = (phase: SigningPhase) => {
    const phases: Record<SigningPhase, { label: string; index: number }> = {
      idle: { label: 'Join', index: 0 },
      setup: { label: 'Join', index: 0 },
      creating_session: { label: 'Joining', index: 1 },
      waiting_for_participants: { label: 'Waiting', index: 2 },
      round1_collect: { label: 'Round 1', index: 3 },
      round1_send: { label: 'Round 1', index: 3 },
      confirm: { label: 'Confirm', index: 4 },
      round2_collect: { label: 'Round 2', index: 5 },
      round2_send: { label: 'Round 2', index: 5 },
      aggregating: { label: 'Waiting', index: 6 },
      complete: { label: 'Done', index: 7 },
      failed: { label: 'Failed', index: -1 },
    };
    return phases[phase] ?? { label: 'Unknown', index: -1 };
  };

  const phaseInfo = getPhaseInfo(state.phase);
  const steps = ['Join', 'Joining', 'Waiting', 'Round 1', 'Confirm', 'Round 2', 'Result', 'Done'];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Change Role
          </button>
          <h1 className="text-3xl font-bold text-white">Participant</h1>
          <p className="text-gray-400 mt-2">Join a signing session and contribute your signature.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, index) => {
            const isActive = index === phaseInfo.index;
            const isComplete = index < phaseInfo.index;

            return (
              <div key={step} className="flex items-center">
                <div
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : isComplete
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {step}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-4 h-0.5 ${isComplete ? 'bg-blue-500' : 'bg-gray-800'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {(state.phase === 'idle' || state.phase === 'setup') && (
            <ParticipantJoin signing={signing} />
          )}

          {state.phase === 'creating_session' && <JoiningSession />}

          {state.phase === 'waiting_for_participants' && <ParticipantWaiting />}

          {(state.phase === 'round1_collect' || state.phase === 'round1_send') && (
            <ParticipantRound1 />
          )}

          {state.phase === 'confirm' && (
            <ParticipantConfirm
              message={state.message}
              onConfirm={() => signing.confirmSigning()}
              onReject={() => signing.rejectSigning()}
            />
          )}

          {(state.phase === 'round2_collect' || state.phase === 'round2_send') && (
            <ParticipantRound2 />
          )}

          {state.phase === 'complete' && (
            <SigningComplete
              signature={state.signature}
              verified={state.verified}
              onReset={onBack}
              isParticipant
            />
          )}

          {state.phase === 'failed' && (
            <SigningFailed error={state.error} onReset={onBack} />
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantJoin({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const [sessionId, setSessionId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [shares, setShares] = useState<Array<{ groupId: string; name: string; participantId: number }>>([]);

  // Load available key shares
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShares(getStoredFrostSharesInfo());
  }, []);

  const canJoin = sessionId.length > 0 && selectedGroup && password.length > 0;

  const handleJoin = () => {
    if (selectedGroup) {
      signing.startAsParticipant(sessionId, selectedGroup, password);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Join Session</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Session ID
        </label>
        <input
          type="text"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Paste session ID from coordinator"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Key Share
        </label>
        {shares.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-gray-700 text-center">
            <p className="text-gray-500">No key shares found. Create a group first.</p>
            <Link href="/create-group" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
              Create Group
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {shares.map((share) => (
              <button
                key={share.groupId}
                onClick={() => setSelectedGroup(share.groupId)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  selectedGroup === share.groupId
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      selectedGroup === share.groupId ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                    }`}
                  />
                  <div>
                    <div className="font-medium text-white">{share.name}</div>
                    <div className="text-sm text-gray-400">
                      Participant #{share.participantId}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password to unlock key share"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <button
        onClick={handleJoin}
        disabled={!canJoin}
        className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Join Session
      </button>
    </div>
  );
}

function JoiningSession() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-xl font-semibold text-white mb-2">Joining Session</h2>
      <p className="text-gray-400">Connecting to signing ceremony...</p>
    </div>
  );
}

function ParticipantWaiting() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Waiting for Coordinator</h2>
      <p className="text-gray-400">The coordinator will start the signing ceremony when ready...</p>
    </div>
  );
}

function ParticipantRound1() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-xl font-semibold text-white mb-2">Round 1: Generating Commitment</h2>
      <p className="text-gray-400">Creating and sending your commitment...</p>
    </div>
  );
}

function ParticipantConfirm({
  message,
  onConfirm,
  onReject,
}: {
  message: string | null;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Confirm Transaction</h2>
      <p className="text-gray-400 mb-6">Review the message before signing.</p>

      <div className="p-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-yellow-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-semibold text-yellow-400 mb-2">Review Carefully</h4>
            <p className="text-yellow-400/80 text-sm">
              Make sure you understand and approve this message before signing.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
        <p className="text-sm text-gray-400 mb-2">Message to Sign (Hex)</p>
        <code className="text-sm text-blue-400 font-mono break-all">
          {message || 'No message'}
        </code>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onReject}
          className="flex-1 py-3 px-6 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium rounded-xl transition-colors"
        >
          Reject
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 px-6 bg-green-500 hover:bg-green-400 text-gray-900 font-semibold rounded-xl transition-colors"
        >
          Confirm & Sign
        </button>
      </div>
    </div>
  );
}

function ParticipantRound2() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 mx-auto mb-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <h2 className="text-xl font-semibold text-white mb-2">Round 2: Generating Signature Share</h2>
      <p className="text-gray-400">Creating and sending your signature share...</p>
    </div>
  );
}

// =============================================================================
// Shared Components
// =============================================================================

function SigningComplete({
  signature,
  verified,
  onReset,
  isParticipant = false,
}: {
  signature: string | null;
  verified: boolean;
  onReset: () => void;
  isParticipant?: boolean;
}) {
  const accentColor = isParticipant ? 'blue' : 'amber';

  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">
        {isParticipant ? 'Done!' : 'Signing Complete!'}
      </h2>
      <p className="text-gray-400 mb-6">
        {isParticipant
          ? 'Your signature share has been submitted successfully.'
          : 'The aggregate signature has been successfully generated.'}
      </p>

      {signature && (
        <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-4 text-left">
          <p className="text-sm text-gray-400 mb-2">Aggregate Signature</p>
          <code className="text-sm text-green-400 font-mono break-all">{signature}</code>
        </div>
      )}

      {!isParticipant && (
        <div className={`p-3 rounded-lg mb-6 ${verified ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {verified ? 'Signature verified successfully' : 'Signature verification failed'}
        </div>
      )}

      <button
        onClick={onReset}
        className={`px-8 py-3 bg-${accentColor}-500 hover:bg-${accentColor}-400 ${isParticipant ? 'text-white' : 'text-gray-900'} font-semibold rounded-xl transition-colors`}
      >
        {isParticipant ? 'Return to Home' : 'Start New Session'}
      </button>
    </div>
  );
}

function SigningFailed({ error, onReset }: { error: string | null; onReset: () => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">Signing Failed</h2>
      <p className="text-gray-400 mb-6">{error || 'An error occurred during the signing ceremony.'}</p>

      <button
        onClick={onReset}
        className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
