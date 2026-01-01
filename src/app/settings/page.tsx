'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFrostStore } from '@/lib/store';
import { useToast } from '@/components/ui/toast';

export default function SettingsPage() {
  // Use individual selectors to avoid SSR hydration issues with object references
  const frostdUrl = useFrostStore((state) => state.frostdUrl);
  const isConnected = useFrostStore((state) => state.isConnected);
  const hasKeys = useFrostStore((state) => state.hasKeys);
  const authKeyPair = useFrostStore((state) => state.authKeyPair);
  const demoMode = useFrostStore((state) => state.demoMode);
  const setFrostdUrl = useFrostStore((state) => state.setFrostdUrl);
  const resetStore = useFrostStore((state) => state.resetStore);
  const setDemoMode = useFrostStore((state) => state.setDemoMode);
  const { success, info } = useToast();

  const [newUrl, setNewUrl] = useState(frostdUrl);
  const [urlSaved, setUrlSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSaveUrl = () => {
    try {
      new URL(newUrl);
      setFrostdUrl(newUrl);
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 2000);
    } catch {
      // Invalid URL
    }
  };

  const handleReset = () => {
    resetStore();
    setShowResetConfirm(false);
    window.location.href = '/';
  };

  const copyPubkey = async () => {
    if (authKeyPair?.publicKey) {
      await navigator.clipboard.writeText(authKeyPair.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-2">
            Configure your FROST Multi-Sig application.
          </p>
        </div>

        {/* Demo Mode Toggle */}
        <section className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl border border-amber-500/30 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  Demo Mode
                  {demoMode && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                      Active
                    </span>
                  )}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {demoMode
                    ? 'Using simulated frostd server. All signing ceremonies are mocked for testing.'
                    : 'Connect to a real frostd server for production use.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setDemoMode(!demoMode);
                if (!demoMode) {
                  success('Demo Mode Enabled', 'You can now test the full signing flow without a real server.');
                } else {
                  info('Demo Mode Disabled', 'The app will now connect to a real frostd server.');
                }
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                demoMode ? 'bg-amber-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  demoMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {demoMode && (
            <div className="mt-4 p-4 rounded-xl bg-gray-900/50 border border-gray-800">
              <h3 className="text-sm font-medium text-white mb-2">Demo Features:</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Simulated participant joins (3 mock participants)
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full Round 1 & Round 2 signing simulation
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Signature aggregation with realistic delays
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Random failures (10%) to test error handling
                </li>
              </ul>
            </div>
          )}
        </section>

        {/* Server Configuration */}
        <section className={`bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6 ${demoMode ? 'opacity-50' : ''}`}>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            Server Configuration
            {demoMode && (
              <span className="text-xs text-gray-500 font-normal">(Ignored in Demo Mode)</span>
            )}
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              frostd Server URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono text-sm"
              />
              <button
                onClick={handleSaveUrl}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 font-medium rounded-xl transition-colors"
              >
                {urlSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800">
            <div
              className={`w-3 h-3 rounded-full ${
                demoMode ? 'bg-amber-400' : isConnected ? 'bg-green-400' : 'bg-red-400'
              }`}
            />
            <span className="text-sm text-gray-300">
              {demoMode ? 'Demo Mode' : isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <span className="ml-auto text-xs text-gray-500 font-mono">
              {demoMode ? 'Mock Server' : frostdUrl}
            </span>
          </div>
        </section>

        {/* Public Key */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Authentication Keys
          </h2>

          {hasKeys && authKeyPair ? (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Public Key
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                    <code className="text-sm text-amber-400 font-mono break-all">
                      {authKeyPair.publicKey}
                    </code>
                  </div>
                  <button
                    onClick={copyPubkey}
                    className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors flex items-center gap-2"
                  >
                    {copied ? (
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
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Share this public key with others who need to send you encrypted messages or verify your identity.
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-gray-700 text-center">
              <p className="text-gray-500 mb-4">No authentication keys configured</p>
              <Link
                href="/setup"
                className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 font-medium"
              >
                Complete Setup
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          )}
        </section>

        {/* Export Keys */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </h2>

          <p className="text-gray-400 text-sm mb-4">
            Export your keys and data for backup or migration.
          </p>

          <div className="space-y-3">
            <button
              disabled={!hasKeys}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-white">Export Public Key</span>
              </div>
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              disabled={!hasKeys}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-white">Export Encrypted Backup</span>
              </div>
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-gray-900 rounded-2xl border border-red-500/30 p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Danger Zone
          </h2>

          <p className="text-gray-400 text-sm mb-4">
            These actions are irreversible. Make sure you have exported your keys before proceeding.
          </p>

          {showResetConfirm ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm mb-4">
                <strong>Are you sure?</strong> This will delete all your keys, settings, and session data.
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-400 text-white font-medium rounded-lg transition-colors"
                >
                  Yes, Reset Everything
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="text-red-400 font-medium">Reset Application</span>
              </div>
              <svg className="w-5 h-5 text-red-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
