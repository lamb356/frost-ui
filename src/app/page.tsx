'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFrostStore } from '@/lib/store';

export default function HomePage() {
  // Use individual selectors to avoid SSR hydration issues with object references
  const frostdUrl = useFrostStore((state) => state.frostdUrl);
  const isConnected = useFrostStore((state) => state.isConnected);
  const isConnecting = useFrostStore((state) => state.isConnecting);
  const hasKeys = useFrostStore((state) => state.hasKeys);
  const pubkey = useFrostStore((state) => state.pubkey);
  const setupComplete = useFrostStore((state) => state.setupComplete);
  const [copiedPubkey, setCopiedPubkey] = useState(false);

  // Truncate pubkey for display
  const truncatedPubkey = pubkey
    ? `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
    : null;

  const copyPubkey = async () => {
    if (pubkey) {
      await navigator.clipboard.writeText(pubkey);
      setCopiedPubkey(true);
      setTimeout(() => setCopiedPubkey(false), 2000);
    }
  };

  // If setup not complete, redirect or show setup prompt
  if (!setupComplete) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/30">
            <svg className="w-10 h-10 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Welcome to FROST Multi-Sig</h1>
          <p className="text-xl text-gray-400 mb-8">
            Secure threshold signatures for Zcash. Let&apos;s get you set up.
          </p>
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold rounded-xl transition-colors shadow-lg shadow-amber-500/20"
          >
            Start Setup
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <section className="text-center py-12 mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
          FROST Threshold Signatures
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-8">
          Coordinate multi-party signing ceremonies for Zcash transactions using the FROST
          protocol. Achieve t-of-n threshold security without revealing any participant&apos;s
          private key share.
        </p>

        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {/* Connection Status */}
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-900 border border-gray-800">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnecting
                  ? 'bg-yellow-400 animate-pulse'
                  : isConnected
                  ? 'bg-green-400'
                  : 'bg-red-400'
              }`}
            />
            <span className="text-gray-400 text-sm">
              {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <code className="text-amber-400/80 font-mono text-xs">{frostdUrl}</code>
          </div>

          {/* Public Key Display */}
          {truncatedPubkey && (
            <button
              onClick={copyPubkey}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors group"
              title="Click to copy full public key"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <code className="text-gray-300 font-mono text-xs group-hover:text-amber-400 transition-colors">
                {truncatedPubkey}
              </code>
              {copiedPubkey ? (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Main Action Cards */}
      <section className="grid md:grid-cols-2 gap-6 mb-12">
        <ActionCard
          href="/create-group"
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          title="Create Signing Group"
          description="Set up a new t-of-n threshold group using trusted dealer key generation. Generate and distribute key shares to participants."
          buttonText="Create Group"
        />

        <ActionCard
          href="/sign"
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          }
          title="Sign Transaction"
          description="Coordinate a signing ceremony as either a coordinator or participant. Securely sign Zcash transactions with your threshold group."
          buttonText="Start Signing"
        />
      </section>

      {/* Quick Links */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Quick Links</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickLink
            href="/sessions"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="My Sessions"
            description="View active and past signing sessions"
          />

          <QuickLink
            href="/keys"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            }
            title="Manage Keys"
            description="View and manage your key shares"
          />

          <QuickLink
            href="/import"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            }
            title="Import Share"
            description="Import an existing key share"
          />

          <QuickLink
            href="https://frost.zfnd.org"
            external
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
            title="Documentation"
            description="Learn about FROST protocol"
          />
        </div>
      </section>

      {/* Status Cards */}
      <section className="grid sm:grid-cols-3 gap-4">
        <StatusCard
          label="Auth Keys"
          value={hasKeys ? 'Configured' : 'Not Set'}
          status={hasKeys ? 'success' : 'warning'}
        />
        <StatusCard
          label="Server"
          value={isConnected ? 'Connected' : 'Disconnected'}
          status={isConnected ? 'success' : 'error'}
        />
        <StatusCard
          label="Key Shares"
          value="0 groups"
          status="neutral"
        />
      </section>
    </div>
  );
}

// =============================================================================
// Components
// =============================================================================

interface ActionCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonText: string;
}

function ActionCard({ href, icon, title, description, buttonText }: ActionCardProps) {
  return (
    <Link
      href={href}
      className="group block p-8 rounded-2xl bg-gray-900 border border-gray-800 hover:border-amber-500/50 transition-all hover:shadow-lg hover:shadow-amber-500/10"
    >
      <div className="w-16 h-16 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-6 group-hover:bg-amber-500/20 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-gray-400 mb-6">{description}</p>
      <span className="inline-flex items-center gap-2 text-amber-400 font-medium group-hover:gap-3 transition-all">
        {buttonText}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </span>
    </Link>
  );
}

interface QuickLinkProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  external?: boolean;
}

function QuickLink({ href, icon, title, description, external }: QuickLinkProps) {
  const Component = external ? 'a' : Link;
  const props = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <Component
      href={href}
      {...props}
      className="flex items-start gap-4 p-4 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors group"
    >
      <div className="w-10 h-10 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center flex-shrink-0 group-hover:text-amber-400 transition-colors">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-white flex items-center gap-1">
          {title}
          {external && (
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          )}
        </h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </Component>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
  status: 'success' | 'warning' | 'error' | 'neutral';
}

function StatusCard({ label, value, status }: StatusCardProps) {
  const statusColors = {
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    neutral: 'text-gray-400',
  };

  return (
    <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`font-medium ${statusColors[status]}`}>{value}</p>
    </div>
  );
}
