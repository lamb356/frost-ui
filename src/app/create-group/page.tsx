'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

interface Participant {
  id: number;
  name: string;
  pubkey: string;
}

interface GeneratedShare {
  participantId: number;
  participantName: string;
  secretShare: string;
  publicKeyShare: string;
}

export default function CreateGroupPage() {
  const [threshold, setThreshold] = useState(2);
  const [totalParticipants, setTotalParticipants] = useState(3);
  const [participants, setParticipants] = useState<Participant[]>([
    { id: 1, name: 'Participant 1', pubkey: '' },
    { id: 2, name: 'Participant 2', pubkey: '' },
    { id: 3, name: 'Participant 3', pubkey: '' },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedShares, setGeneratedShares] = useState<GeneratedShare[] | null>(null);
  const [groupPubkey, setGroupPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Update participants when total changes
  const handleTotalChange = useCallback((newTotal: number) => {
    setTotalParticipants(newTotal);
    if (threshold > newTotal) {
      setThreshold(newTotal);
    }

    setParticipants((prev) => {
      if (newTotal > prev.length) {
        // Add new participants
        const newParticipants = [...prev];
        for (let i = prev.length + 1; i <= newTotal; i++) {
          newParticipants.push({ id: i, name: `Participant ${i}`, pubkey: '' });
        }
        return newParticipants;
      } else {
        // Remove excess participants
        return prev.slice(0, newTotal);
      }
    });
  }, [threshold]);

  const updateParticipant = (id: number, field: 'name' | 'pubkey', value: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      // Validate all participants have names
      for (const p of participants) {
        if (!p.name.trim()) {
          throw new Error(`Participant ${p.id} must have a name`);
        }
      }

      // Simulate key generation (in real app, this would use FROST library)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Generate mock shares
      const mockGroupPubkey = generateMockHex(64);
      const mockShares: GeneratedShare[] = participants.map((p) => ({
        participantId: p.id,
        participantName: p.name,
        secretShare: generateMockHex(64),
        publicKeyShare: generateMockHex(64),
      }));

      setGroupPubkey(mockGroupPubkey);
      setGeneratedShares(mockShares);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate shares');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const resetForm = () => {
    setGeneratedShares(null);
    setGroupPubkey(null);
    setError(null);
  };

  // If shares are generated, show the distribution view
  if (generatedShares && groupPubkey) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
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
            <h1 className="text-3xl font-bold text-white">Shares Generated</h1>
            <p className="text-gray-400 mt-2">
              Distribute these shares securely to each participant. Each share should only be given to the intended recipient.
            </p>
          </div>

          {/* Warning */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-8">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="font-medium text-red-400">Security Warning</h4>
                <p className="text-sm text-red-400/70">
                  Secret shares must be distributed securely and kept confidential. Never share a participant&apos;s
                  secret share with anyone else. This information will not be shown again.
                </p>
              </div>
            </div>
          </div>

          {/* Group Info */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Group Configuration</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Threshold</p>
                <p className="text-xl font-bold text-amber-400">
                  {threshold} of {totalParticipants}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm text-gray-500">Group Public Key</p>
                <p className="font-mono text-sm text-amber-400 break-all">
                  {groupPubkey}
                </p>
              </div>
            </div>
          </div>

          {/* Shares */}
          <div className="space-y-4 mb-8">
            <h3 className="text-lg font-semibold text-white">Participant Shares</h3>
            {generatedShares.map((share, index) => (
              <div
                key={share.participantId}
                className="bg-gray-900 rounded-xl border border-gray-800 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                      {share.participantId}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{share.participantName}</h4>
                      <p className="text-sm text-gray-500">Participant ID: {share.participantId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(share, null, 2), index)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {copiedIndex === index ? (
                      <>
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Share
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Secret Share (KEEP PRIVATE)</p>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <code className="text-xs text-red-400 break-all font-mono">
                        {share.secretShare}
                      </code>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Public Key Share</p>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <code className="text-xs text-green-400 break-all font-mono">
                        {share.publicKeyShare}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={resetForm}
              className="flex-1 py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
            >
              Create Another Group
            </button>
            <Link
              href="/"
              className="flex-1 py-3 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors text-center"
            >
              Done
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Configuration form
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
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
          <h1 className="text-3xl font-bold text-white">Create Signing Group</h1>
          <p className="text-gray-400 mt-2">
            Configure a new threshold signing group using trusted dealer key generation.
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {/* Threshold Configuration */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Threshold Configuration</h3>

            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Threshold (t)
                </label>
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
                >
                  {Array.from({ length: totalParticipants }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-2">
                  Minimum signers required
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Total Participants (n)
                </label>
                <select
                  value={totalParticipants}
                  onChange={(e) => handleTotalChange(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-2">
                  Total group members
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-amber-400 text-sm">
                <strong>{threshold} of {totalParticipants}</strong> - Any {threshold} participants will be able to
                sign transactions. At least {threshold} participants must be online and cooperating.
              </p>
            </div>
          </div>

          {/* Participants */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Participants</h3>
            <div className="space-y-4">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-gray-800/50 border border-gray-700"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold flex-shrink-0">
                    {participant.id}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input
                        type="text"
                        value={participant.name}
                        onChange={(e) => updateParticipant(participant.id, 'name', e.target.value)}
                        placeholder="Participant name"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Public Key (optional)
                      </label>
                      <input
                        type="text"
                        value={participant.pubkey}
                        onChange={(e) => updateParticipant(participant.id, 'pubkey', e.target.value)}
                        placeholder="For encryption of share distribution"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isGenerating ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating Key Shares...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Generate Key Shares
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper function to generate mock hex strings
function generateMockHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
