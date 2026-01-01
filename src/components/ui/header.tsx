'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFrostStore } from '@/lib/store';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/sign', label: 'Sign' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/create-group', label: 'Create Group' },
  { href: '/settings', label: 'Settings' },
];

export function Header() {
  const pathname = usePathname();
  // Use individual selectors to avoid SSR hydration issues with object references
  const frostdUrl = useFrostStore((state) => state.frostdUrl);
  const isConnecting = useFrostStore((state) => state.isConnecting);
  const isConnected = useFrostStore((state) => state.isConnected);
  const demoMode = useFrostStore((state) => state.demoMode);

  return (
    <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
              <svg
                className="w-6 h-6 text-gray-900"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">FROST Multi-Sig</h1>
              <p className="text-xs text-gray-400">Zcash Threshold Signing</p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Connection status */}
          <div className="flex items-center gap-3">
            {demoMode && (
              <Link
                href="/settings"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
              >
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-amber-400 font-medium">Demo Mode</span>
              </Link>
            )}
            {!demoMode && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnecting
                      ? 'bg-yellow-400 animate-pulse'
                      : isConnected
                      ? 'bg-green-400'
                      : 'bg-red-400'
                  }`}
                />
                <span className="text-xs text-gray-400 font-mono truncate max-w-32">
                  {new URL(frostdUrl).host}
                </span>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
