/**
 * useAuth Hook
 *
 * Manages authentication with the frostd server:
 * - Challenge/response authentication flow
 * - Token storage and refresh
 * - Auto-logout on token expiry
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrostStore } from '@/lib/store';
import { FrostClient } from '@/lib/frost-client';
import { signChallenge } from '@/lib/crypto';
import { loadAuthKeys } from '@/lib/crypto/keystore';

// =============================================================================
// Types
// =============================================================================

export interface UseAuthOptions {
  /** Auto-refresh token before expiry (default: true) */
  autoRefresh?: boolean;
  /** Seconds before expiry to trigger refresh (default: 300 = 5 min) */
  refreshThreshold?: number;
}

export interface UseAuthResult {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether authentication is in progress */
  isAuthenticating: boolean;
  /** Current public key */
  pubkey: string | null;
  /** Error message if authentication failed */
  error: string | null;
  /** Login with password to unlock keys */
  login: (password: string) => Promise<boolean>;
  /** Logout and clear session */
  logout: () => void;
  /** Refresh the auth token */
  refreshToken: () => Promise<boolean>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAuth(options: UseAuthOptions = {}): UseAuthResult {
  const { autoRefresh = true, refreshThreshold = 300 } = options;

  // Store state
  const {
    isAuthenticated,
    accessToken,
    pubkey,
    tokenExpiresAt,
    frostdUrl,
    setAuthenticated,
    clearAuth,
  } = useFrostStore();

  // Local state
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const clientRef = useRef<FrostClient | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateKeyRef = useRef<string | null>(null);

  // Initialize client
  useEffect(() => {
    clientRef.current = new FrostClient({ baseUrl: frostdUrl });

    // Set existing token if available
    if (accessToken && tokenExpiresAt) {
      clientRef.current.setAccessToken(accessToken, tokenExpiresAt);
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [frostdUrl, accessToken, tokenExpiresAt]);

  // Schedule token refresh
  const scheduleRefresh = useCallback(() => {
    if (!autoRefresh || !tokenExpiresAt || !privateKeyRef.current) {
      return;
    }

    // Clear existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Calculate when to refresh
    const now = Date.now();
    const refreshAt = tokenExpiresAt - refreshThreshold * 1000;
    const delay = Math.max(0, refreshAt - now);

    if (delay > 0) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTokenInternal();
      }, delay);
    }
  }, [autoRefresh, tokenExpiresAt, refreshThreshold]);

  // Internal refresh function
  const refreshTokenInternal = useCallback(async (): Promise<boolean> => {
    if (!clientRef.current || !pubkey || !privateKeyRef.current) {
      return false;
    }

    try {
      // Get new challenge (no pubkey required per spec)
      const { challenge } = await clientRef.current.getChallenge();

      // Sign the challenge using XEdDSA
      const signature = signChallenge(privateKeyRef.current, challenge);

      // Login with signed challenge (challenge, pubkey, signature per spec)
      const response = await clientRef.current.login(challenge, pubkey, signature);

      // Token is valid for 1 hour per spec
      const expiresAt = Date.now() + 60 * 60 * 1000;

      // Update store
      setAuthenticated(response.access_token, pubkey, expiresAt);

      // Schedule next refresh
      scheduleRefresh();

      return true;
    } catch (err) {
      console.error('Token refresh failed:', err);
      return false;
    }
  }, [pubkey, setAuthenticated, scheduleRefresh]);

  // Login function
  const login = useCallback(async (password: string): Promise<boolean> => {
    if (!clientRef.current) {
      setError('Client not initialized');
      return false;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Load keys from storage
      const keys = await loadAuthKeys(password);
      privateKeyRef.current = keys.privateKey;

      // Get challenge from server (no pubkey required per spec)
      const { challenge } = await clientRef.current.getChallenge();

      // Sign the challenge using XEdDSA
      const signature = signChallenge(keys.privateKey, challenge);

      // Login with signed challenge (challenge, pubkey, signature per spec)
      const response = await clientRef.current.login(
        challenge,
        keys.publicKey,
        signature
      );

      // Token is valid for 1 hour per spec
      const expiresAt = Date.now() + 60 * 60 * 1000;

      // Update store
      setAuthenticated(response.access_token, keys.publicKey, expiresAt);

      // Schedule refresh
      scheduleRefresh();

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';

      // Provide more specific error messages
      if (message.includes('decrypt') || message.includes('password')) {
        setError('Invalid password');
      } else if (message.includes('No stored keys')) {
        setError('No keys found. Please complete setup first.');
      } else if (message.includes('Network') || message.includes('fetch')) {
        setError('Unable to connect to server. Check your connection.');
      } else {
        setError(message);
      }

      privateKeyRef.current = null;
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [setAuthenticated, scheduleRefresh]);

  // Logout function
  const logout = useCallback(() => {
    // Clear refresh timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    // Clear private key from memory
    privateKeyRef.current = null;

    // Clear client token
    if (clientRef.current) {
      clientRef.current.logout();
    }

    // Clear store
    clearAuth();
    setError(null);
  }, [clearAuth]);

  // Public refresh function
  const refreshToken = useCallback(async (): Promise<boolean> => {
    return refreshTokenInternal();
  }, [refreshTokenInternal]);

  // Check token expiry on mount and periodically
  useEffect(() => {
    if (!isAuthenticated || !tokenExpiresAt) {
      return;
    }

    const checkExpiry = () => {
      const now = Date.now();
      if (now >= tokenExpiresAt) {
        // Token expired, logout
        logout();
      }
    };

    // Check immediately
    checkExpiry();

    // Check every minute
    const interval = setInterval(checkExpiry, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated, tokenExpiresAt, logout]);

  return {
    isAuthenticated,
    isAuthenticating,
    pubkey,
    error,
    login,
    logout,
    refreshToken,
  };
}

// =============================================================================
// Helper Hooks
// =============================================================================

/**
 * Hook to get the current FrostClient instance.
 * Returns null if not authenticated.
 */
export function useFrostClient(): FrostClient | null {
  const { frostdUrl, accessToken, tokenExpiresAt } = useFrostStore();
  const [client, setClient] = useState<FrostClient | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClient(null);
      return;
    }

    const newClient = new FrostClient({ baseUrl: frostdUrl });
    newClient.setAccessToken(accessToken, tokenExpiresAt ?? undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClient(newClient);
  }, [frostdUrl, accessToken, tokenExpiresAt]);

  return client;
}

/**
 * Hook to require authentication.
 * Redirects to login if not authenticated.
 */
export function useRequireAuth(): {
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  const { isAuthenticated, isAuthenticating } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Give time for state to hydrate
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timeout);
  }, []);

  return {
    isAuthenticated,
    isLoading: isLoading || isAuthenticating,
  };
}
