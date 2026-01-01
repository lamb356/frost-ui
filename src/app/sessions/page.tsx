'use client';

import Link from 'next/link';
import { useFrostStore, type SessionHistoryEntry } from '@/lib/store';
import { PageLoading } from '@/components/ui/loading';
import { useEffect, useState } from 'react';

export default function SessionsPage() {
  // Use individual selectors to avoid SSR hydration issues with object references
  const sessionHistory = useFrostStore((state) => state.sessionHistory);
  const clearSessionHistory = useFrostStore((state) => state.clearSessionHistory);
  const removeSessionFromHistory = useFrostStore((state) => state.removeSessionFromHistory);
  const [isHydrated, setIsHydrated] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');

  // Wait for hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return <PageLoading title="Loading Sessions" description="Please wait..." />;
  }

  const filteredSessions = sessionHistory.filter((session) => {
    if (filter === 'all') return true;
    return session.status === filter;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: SessionHistoryEntry['status']) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'expired':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'coordinator') {
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Sessions</h1>
          <p className="text-gray-400 mt-1">
            View your signing session history
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-medium rounded-lg transition-colors"
          >
            New Session
          </Link>
          {sessionHistory.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all session history?')) {
                  clearSessionHistory();
                }
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              Clear History
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        {(['all', 'active', 'completed', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-gray-800 text-gray-400 border border-transparent hover:bg-gray-700'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Sessions List */}
      {filteredSessions.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              formatDate={formatDate}
              getStatusColor={getStatusColor}
              getRoleIcon={getRoleIcon}
              onRemove={() => {
                if (confirm('Remove this session from history?')) {
                  removeSessionFromHistory(session.sessionId);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Components
// =============================================================================

interface SessionCardProps {
  session: SessionHistoryEntry;
  formatDate: (timestamp: number) => string;
  getStatusColor: (status: SessionHistoryEntry['status']) => string;
  getRoleIcon: (role: string) => React.ReactNode;
  onRemove: () => void;
}

function SessionCard({
  session,
  formatDate,
  getStatusColor,
  getRoleIcon,
  onRemove,
}: SessionCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-white">{session.name}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(
                session.status
              )}`}
            >
              {session.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-400">
            <div className="flex items-center gap-1.5">
              {getRoleIcon(session.role)}
              <span className="capitalize">{session.role}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>
                {session.threshold} of {session.participantCount}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDate(session.createdAt)}</span>
            </div>
          </div>

          {session.transactionHash && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Transaction:</span>
                <code className="text-amber-400 font-mono text-xs">
                  {session.transactionHash.slice(0, 16)}...{session.transactionHash.slice(-16)}
                </code>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4">
          {session.status === 'active' && (
            <Link
              href={`/sign?session=${session.sessionId}`}
              className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors"
            >
              Resume
            </Link>
          )}
          <button
            onClick={onRemove}
            className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Remove from history"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  filter: 'all' | 'active' | 'completed' | 'cancelled';
}

function EmptyState({ filter }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gray-800 flex items-center justify-center">
        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">
        {filter === 'all' ? 'No sessions yet' : `No ${filter} sessions`}
      </h3>
      <p className="text-gray-400 mb-6 max-w-md mx-auto">
        {filter === 'all'
          ? 'Start a new signing session to see your history here.'
          : `You don't have any ${filter} sessions in your history.`}
      </p>
      <Link
        href="/sign"
        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-medium rounded-lg transition-colors"
      >
        Start a Session
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </Link>
    </div>
  );
}
