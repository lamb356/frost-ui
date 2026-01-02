'use client';

import { useEffect, useState } from 'react';
import { useFrostStore } from '@/lib/store';
import { FrostClient, MockFrostClient } from '@/lib/frost-client';

/**
 * Unified client interface for both real and mock clients.
 * Both clients implement the same methods.
 */
export type UnifiedClient = FrostClient | MockFrostClient;

/**
 * Hook to get the appropriate client based on demo mode setting.
 * Returns either FrostClient (live mode) or MockFrostClient (demo mode).
 */
export function useClient(): UnifiedClient | null {
  const frostdUrl = useFrostStore((state) => state.frostdUrl);
  const demoMode = useFrostStore((state) => state.demoMode);
  const accessToken = useFrostStore((state) => state.accessToken);
  const tokenExpiresAt = useFrostStore((state) => state.tokenExpiresAt);

  const [client, setClient] = useState<UnifiedClient | null>(null);

  // Create or update client when dependencies change
  useEffect(() => {
    if (demoMode) {
      // Create mock client
      const mockClient = new MockFrostClient({ baseUrl: frostdUrl });
      setClient(mockClient);
    } else {
      // Create real client
      const realClient = new FrostClient({ baseUrl: frostdUrl });
      if (accessToken) {
        realClient.setAccessToken(accessToken, tokenExpiresAt ?? undefined);
      }
      setClient(realClient);
    }
  }, [demoMode, frostdUrl, accessToken, tokenExpiresAt]);

  return client;
}

/**
 * Hook to check if demo mode is active.
 */
export function useDemoMode(): {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
} {
  const demoMode = useFrostStore((state) => state.demoMode);
  const setDemoMode = useFrostStore((state) => state.setDemoMode);

  return {
    isDemoMode: demoMode,
    toggleDemoMode: () => setDemoMode(!demoMode),
  };
}

/**
 * Hook that provides a demo mode banner component.
 * Shows a persistent banner when demo mode is active.
 */
export function useDemoModeBanner(): {
  isVisible: boolean;
  message: string;
} {
  const demoMode = useFrostStore((state) => state.demoMode);

  return {
    isVisible: demoMode,
    message: 'Demo Mode Active - Using simulated server',
  };
}
