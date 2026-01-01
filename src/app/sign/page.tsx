'use client';

import { useState } from 'react';
import Link from 'next/link';

type Role = 'coordinator' | 'participant' | null;
type CoordinatorState = 'setup' | 'waiting' | 'round1' | 'round2' | 'complete';
type ParticipantState = 'join' | 'waiting' | 'round1' | 'confirm' | 'round2' | 'complete';

interface MockParticipant {
  id: number;
  name: string;
  status: 'joined' | 'committed' | 'signed';
}

export default function SignPage() {
  const [role, setRole] = useState<Role>(null);

  // Coordinator state
  const [coordState, setCoordState] = useState<CoordinatorState>('setup');
  const [sessionName, setSessionName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [messageToSign, setMessageToSign] = useState('');
  const [participants, setParticipants] = useState<MockParticipant[]>([]);

  // Participant state
  const [partState, setPartState] = useState<ParticipantState>('join');
  const [joinCode, setJoinCode] = useState('');
  const [transactionDetails, setTransactionDetails] = useState<string | null>(null);

  // Reset to role selection
  const resetRole = () => {
    setRole(null);
    setCoordState('setup');
    setPartState('join');
    setSessionName('');
    setInviteCode('');
    setMessageToSign('');
    setParticipants([]);
    setJoinCode('');
    setTransactionDetails(null);
  };

  // Role selection
  if (!role) {
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
            <p className="text-gray-400 mt-2">
              Choose your role in the signing ceremony.
            </p>
          </div>

          <div className="grid gap-6">
            <button
              onClick={() => setRole('coordinator')}
              className="group p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-amber-500/50 transition-all text-left"
            >
              <div className="w-16 h-16 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">I&apos;m the Coordinator</h3>
              <p className="text-gray-400 mb-4">
                Create a new signing session, invite participants, and coordinate the signing ceremony.
              </p>
              <span className="inline-flex items-center gap-2 text-amber-400 font-medium group-hover:gap-3 transition-all">
                Start as Coordinator
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>

            <button
              onClick={() => setRole('participant')}
              className="group p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-amber-500/50 transition-all text-left"
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

  // Coordinator Flow
  if (role === 'coordinator') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <button
              onClick={resetRole}
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Change Role
            </button>
            <h1 className="text-3xl font-bold text-white">Coordinator</h1>
            <p className="text-gray-400 mt-2">
              Coordinate a threshold signing ceremony.
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {['Setup', 'Waiting', 'Round 1', 'Round 2', 'Complete'].map((step, index) => {
              const states: CoordinatorState[] = ['setup', 'waiting', 'round1', 'round2', 'complete'];
              const currentIndex = states.indexOf(coordState);
              const isActive = index === currentIndex;
              const isComplete = index < currentIndex;

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
                  {index < 4 && (
                    <div className={`w-8 h-0.5 ${isComplete ? 'bg-amber-500' : 'bg-gray-800'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Content */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
            {coordState === 'setup' && (
              <CoordinatorSetup
                sessionName={sessionName}
                setSessionName={setSessionName}
                messageToSign={messageToSign}
                setMessageToSign={setMessageToSign}
                onNext={() => {
                  setInviteCode(generateMockCode());
                  setCoordState('waiting');
                }}
              />
            )}

            {coordState === 'waiting' && (
              <CoordinatorWaiting
                inviteCode={inviteCode}
                participants={participants}
                onAddParticipant={() => {
                  setParticipants([
                    ...participants,
                    { id: participants.length + 1, name: `Participant ${participants.length + 1}`, status: 'joined' },
                  ]);
                }}
                onStartSigning={() => setCoordState('round1')}
              />
            )}

            {coordState === 'round1' && (
              <CoordinatorRound1
                participants={participants}
                onAllCommitted={() => {
                  setParticipants(participants.map((p) => ({ ...p, status: 'committed' })));
                  setCoordState('round2');
                }}
              />
            )}

            {coordState === 'round2' && (
              <CoordinatorRound2
                participants={participants}
                onAllSigned={() => {
                  setParticipants(participants.map((p) => ({ ...p, status: 'signed' })));
                  setCoordState('complete');
                }}
              />
            )}

            {coordState === 'complete' && (
              <CoordinatorComplete onReset={resetRole} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Participant Flow
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <button
            onClick={resetRole}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Change Role
          </button>
          <h1 className="text-3xl font-bold text-white">Participant</h1>
          <p className="text-gray-400 mt-2">
            Join a signing session and contribute your signature.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {['Join', 'Wait', 'Round 1', 'Confirm', 'Round 2', 'Done'].map((step, index) => {
            const states: ParticipantState[] = ['join', 'waiting', 'round1', 'confirm', 'round2', 'complete'];
            const currentIndex = states.indexOf(partState);
            const isActive = index === currentIndex;
            const isComplete = index < currentIndex;

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
                {index < 5 && (
                  <div className={`w-4 h-0.5 ${isComplete ? 'bg-blue-500' : 'bg-gray-800'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {partState === 'join' && (
            <ParticipantJoin
              joinCode={joinCode}
              setJoinCode={setJoinCode}
              onJoin={() => setPartState('waiting')}
            />
          )}

          {partState === 'waiting' && (
            <ParticipantWaiting onRound1Start={() => setPartState('round1')} />
          )}

          {partState === 'round1' && (
            <ParticipantRound1
              onCommitmentSent={() => {
                setTransactionDetails('Send 1.5 ZEC to zs1abc...xyz');
                setPartState('confirm');
              }}
            />
          )}

          {partState === 'confirm' && (
            <ParticipantConfirm
              transactionDetails={transactionDetails!}
              onConfirm={() => setPartState('round2')}
              onReject={resetRole}
            />
          )}

          {partState === 'round2' && (
            <ParticipantRound2 onShareSent={() => setPartState('complete')} />
          )}

          {partState === 'complete' && (
            <ParticipantComplete onReset={resetRole} />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Coordinator Components
// =============================================================================

interface CoordinatorSetupProps {
  sessionName: string;
  setSessionName: (name: string) => void;
  messageToSign: string;
  setMessageToSign: (message: string) => void;
  onNext: () => void;
}

function CoordinatorSetup({
  sessionName,
  setSessionName,
  messageToSign,
  setMessageToSign,
  onNext,
}: CoordinatorSetupProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Session Setup</h2>

      <div className="space-y-6 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Session Name
          </label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g., Payment to vendor"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
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
      </div>

      <button
        onClick={onNext}
        disabled={!sessionName.trim()}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Create Session
      </button>
    </div>
  );
}

interface CoordinatorWaitingProps {
  inviteCode: string;
  participants: MockParticipant[];
  onAddParticipant: () => void;
  onStartSigning: () => void;
}

function CoordinatorWaiting({
  inviteCode,
  participants,
  onAddParticipant,
  onStartSigning,
}: CoordinatorWaitingProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Waiting for Participants</h2>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
        <p className="text-sm text-gray-400 mb-2">Share this invite code:</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 text-2xl font-mono text-amber-400 tracking-wider">
            {inviteCode}
          </code>
          <button
            onClick={copyCode}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-white">Participants ({participants.length})</h3>
          <button
            onClick={onAddParticipant}
            className="text-sm text-amber-400 hover:text-amber-300"
          >
            + Simulate Join
          </button>
        </div>
        {participants.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-gray-700 text-center">
            <p className="text-gray-500">Waiting for participants to join...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-800"
              >
                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-medium">
                  {p.id}
                </div>
                <span className="text-white">{p.name}</span>
                <span className="ml-auto text-xs text-green-400">Joined</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onStartSigning}
        disabled={participants.length < 2}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Start Signing ({participants.length} participants)
      </button>
    </div>
  );
}

function CoordinatorRound1({
  participants,
  onAllCommitted,
}: {
  participants: MockParticipant[];
  onAllCommitted: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 1: Collecting Commitments</h2>
      <p className="text-gray-400 mb-6">
        Waiting for all participants to send their commitments...
      </p>

      <div className="space-y-2 mb-6">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-medium">
              {p.id}
            </div>
            <span className="text-white">{p.name}</span>
            <span className="ml-auto">
              {p.status === 'committed' ? (
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
        onClick={onAllCommitted}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
      >
        Simulate All Committed
      </button>
    </div>
  );
}

function CoordinatorRound2({
  participants,
  onAllSigned,
}: {
  participants: MockParticipant[];
  onAllSigned: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 2: Collecting Signature Shares</h2>
      <p className="text-gray-400 mb-6">
        Commitments broadcast. Waiting for signature shares...
      </p>

      <div className="space-y-2 mb-6">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-medium">
              {p.id}
            </div>
            <span className="text-white">{p.name}</span>
            <span className="ml-auto">
              {p.status === 'signed' ? (
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
        onClick={onAllSigned}
        className="w-full py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
      >
        Simulate All Signed
      </button>
    </div>
  );
}

function CoordinatorComplete({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">Signing Complete!</h2>
      <p className="text-gray-400 mb-6">
        The aggregate signature has been successfully generated.
      </p>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-8">
        <p className="text-sm text-gray-400 mb-2">Aggregate Signature</p>
        <code className="text-sm text-green-400 font-mono break-all">
          {generateMockHex(128)}
        </code>
      </div>

      <button
        onClick={onReset}
        className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors"
      >
        Start New Session
      </button>
    </div>
  );
}

// =============================================================================
// Participant Components
// =============================================================================

function ParticipantJoin({
  joinCode,
  setJoinCode,
  onJoin,
}: {
  joinCode: string;
  setJoinCode: (code: string) => void;
  onJoin: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Join Session</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Invite Code
        </label>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Enter invite code"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-center text-2xl font-mono tracking-wider placeholder-gray-500 focus:outline-none focus:border-blue-500"
          maxLength={8}
        />
      </div>

      <button
        onClick={onJoin}
        disabled={joinCode.length < 6}
        className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Join Session
      </button>
    </div>
  );
}

function ParticipantWaiting({ onRound1Start }: { onRound1Start: () => void }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">Waiting for Coordinator</h2>
      <p className="text-gray-400 mb-6">
        The coordinator will start the signing ceremony when ready...
      </p>

      <button
        onClick={onRound1Start}
        className="text-blue-400 hover:text-blue-300 text-sm"
      >
        Simulate Round 1 Start
      </button>
    </div>
  );
}

function ParticipantRound1({ onCommitmentSent }: { onCommitmentSent: () => void }) {
  const [sending, setSending] = useState(false);

  const sendCommitment = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 1000));
    onCommitmentSent();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 1: Send Commitment</h2>
      <p className="text-gray-400 mb-6">
        Generate and send your signing commitment to the coordinator.
      </p>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
        <p className="text-sm text-gray-400 mb-2">Your Commitment</p>
        <code className="text-xs text-blue-400 font-mono break-all">
          {generateMockHex(64)}
        </code>
      </div>

      <button
        onClick={sendCommitment}
        disabled={sending}
        className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send Commitment'}
      </button>
    </div>
  );
}

function ParticipantConfirm({
  transactionDetails,
  onConfirm,
  onReject,
}: {
  transactionDetails: string;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Confirm Transaction</h2>
      <p className="text-gray-400 mb-6">
        Review the transaction before signing.
      </p>

      <div className="p-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-yellow-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-semibold text-yellow-400 mb-2">Review Carefully</h4>
            <p className="text-yellow-400/80 text-sm">
              Make sure you understand and approve this transaction before signing.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
        <p className="text-sm text-gray-400 mb-2">Transaction Details</p>
        <p className="text-white font-medium">{transactionDetails}</p>
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

function ParticipantRound2({ onShareSent }: { onShareSent: () => void }) {
  const [sending, setSending] = useState(false);

  const sendShare = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 1500));
    onShareSent();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Round 2: Send Signature Share</h2>
      <p className="text-gray-400 mb-6">
        Generate and send your signature share.
      </p>

      <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 mb-6">
        <p className="text-sm text-gray-400 mb-2">Your Signature Share</p>
        <code className="text-xs text-blue-400 font-mono break-all">
          {generateMockHex(64)}
        </code>
      </div>

      <button
        onClick={sendShare}
        disabled={sending}
        className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send Signature Share'}
      </button>
    </div>
  );
}

function ParticipantComplete({ onReset }: { onReset: () => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-white mb-4">Done!</h2>
      <p className="text-gray-400 mb-8">
        Your signature share has been submitted. The coordinator will aggregate all shares.
      </p>

      <button
        onClick={onReset}
        className="px-8 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors"
      >
        Return to Home
      </button>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function generateMockCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateMockHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
