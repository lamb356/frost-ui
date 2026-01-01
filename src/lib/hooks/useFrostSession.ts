/**
 * useFrostSession Hook
 *
 * Manages an active FROST signing session using the frostd spec:
 * https://frost.zfnd.org/zcash/server.html
 *
 * Key concepts:
 * - Sessions are created with a fixed set of participant pubkeys
 * - Communication happens via /send and /receive (polling)
 * - Messages must be end-to-end encrypted by the client
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrostStore } from '@/lib/store';
import { FrostClient, MockFrostClient } from '@/lib/frost-client';
import type { SessionId, PublicKey, ReceivedMessage, GetSessionInfoResponse } from '@/types/api';
import { encryptMessage, decryptMessage, bytesToHex } from '@/lib/crypto';

// =============================================================================
// Types
// =============================================================================

export interface UseFrostSessionOptions {
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
}

export interface UseFrostSessionResult {
  // Session state
  sessionId: SessionId | null;
  sessionInfo: GetSessionInfoResponse | null;
  isCoordinator: boolean;
  isLoading: boolean;
  error: string | null;

  // Received messages
  messages: ReceivedMessage[];

  // Actions
  createSession: (pubkeys: PublicKey[], messageCount: number) => Promise<SessionId | null>;
  getSessionInfo: (sessionId: SessionId) => Promise<GetSessionInfoResponse | null>;
  closeSession: () => Promise<void>;

  // Messaging
  sendMessage: (recipients: PublicKey[], message: string) => Promise<boolean>;
  sendToCoordinator: (message: string) => Promise<boolean>;

  // Polling control
  startPolling: (sessionId: SessionId, asCoordinator: boolean) => void;
  stopPolling: () => void;

  // Clear
  clearSession: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFrostSession(
  options: UseFrostSessionOptions = {}
): UseFrostSessionResult {
  const { pollInterval = 2000 } = options;

  // Store state
  const frostdUrl = useFrostStore((state) => state.frostdUrl);
  const accessToken = useFrostStore((state) => state.accessToken);
  const demoMode = useFrostStore((state) => state.demoMode);

  // Local state
  const [sessionId, setSessionId] = useState<SessionId | null>(null);
  const [sessionInfo, setSessionInfo] = useState<GetSessionInfoResponse | null>(null);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);

  // Refs
  const clientRef = useRef<FrostClient | MockFrostClient | null>(null);
  const pollingAbortRef = useRef<AbortController | null>(null);

  // Initialize client
  useEffect(() => {
    if (demoMode) {
      clientRef.current = new MockFrostClient({ baseUrl: frostdUrl });
    } else if (accessToken) {
      const client = new FrostClient({ baseUrl: frostdUrl });
      client.setAccessToken(accessToken);
      clientRef.current = client;
    } else {
      clientRef.current = null;
    }

    return () => {
      // Stop polling on unmount
      if (pollingAbortRef.current) {
        pollingAbortRef.current.abort();
      }
    };
  }, [frostdUrl, accessToken, demoMode]);

  // Create session (coordinator only)
  const createSession = useCallback(
    async (pubkeys: PublicKey[], messageCount: number): Promise<SessionId | null> => {
      if (!clientRef.current) {
        setError('Not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await clientRef.current.createSession(pubkeys, messageCount);
        const newSessionId = response.session_id;

        setSessionId(newSessionId);
        setIsCoordinator(true);

        // Fetch session info
        const info = await clientRef.current.getSessionInfo(newSessionId);
        setSessionInfo(info);

        return newSessionId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Get session info
  const getSessionInfo = useCallback(
    async (sid: SessionId): Promise<GetSessionInfoResponse | null> => {
      if (!clientRef.current) {
        setError('Not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const info = await clientRef.current.getSessionInfo(sid);
        setSessionId(sid);
        setSessionInfo(info);
        return info;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get session info';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Close session (coordinator only)
  const closeSession = useCallback(async (): Promise<void> => {
    if (!clientRef.current || !sessionId) {
      return;
    }

    // Stop polling
    if (pollingAbortRef.current) {
      pollingAbortRef.current.abort();
      pollingAbortRef.current = null;
    }

    setIsLoading(true);

    try {
      await clientRef.current.closeSession(sessionId);
    } catch (err) {
      console.error('Failed to close session:', err);
    } finally {
      setSessionId(null);
      setSessionInfo(null);
      setIsCoordinator(false);
      setMessages([]);
      setIsLoading(false);
    }
  }, [sessionId]);

  // Send message to specific recipients
  const sendMessage = useCallback(
    async (recipients: PublicKey[], message: string): Promise<boolean> => {
      if (!clientRef.current || !sessionId) {
        setError('No active session');
        return false;
      }

      try {
        // Encrypt the message for each recipient
        // In a real implementation, you'd encrypt per-recipient
        // For simplicity, we're sending the same encrypted blob
        const encrypted = await encryptMessage(recipients[0] || '', message);
        const msgHex = bytesToHex(new TextEncoder().encode(JSON.stringify(encrypted)));

        await clientRef.current.send(sessionId, recipients, msgHex);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        return false;
      }
    },
    [sessionId]
  );

  // Send message to coordinator (empty recipients array per spec)
  const sendToCoordinator = useCallback(
    async (message: string): Promise<boolean> => {
      return sendMessage([], message);
    },
    [sendMessage]
  );

  // Start polling for messages
  const startPolling = useCallback(
    (sid: SessionId, asCoordinator: boolean) => {
      // Stop any existing polling
      if (pollingAbortRef.current) {
        pollingAbortRef.current.abort();
      }

      const abortController = new AbortController();
      pollingAbortRef.current = abortController;

      const poll = async () => {
        if (!clientRef.current || abortController.signal.aborted) {
          return;
        }

        try {
          const receivedMessages = await clientRef.current.receive(sid, asCoordinator);

          if (receivedMessages.length > 0) {
            setMessages((prev) => [...prev, ...receivedMessages]);
          }
        } catch (err) {
          if (!abortController.signal.aborted) {
            console.error('Polling error:', err);
          }
        }

        // Schedule next poll if not aborted
        if (!abortController.signal.aborted) {
          setTimeout(poll, pollInterval);
        }
      };

      // Start polling
      poll();
    },
    [pollInterval]
  );

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingAbortRef.current) {
      pollingAbortRef.current.abort();
      pollingAbortRef.current = null;
    }
  }, []);

  // Clear session state
  const clearSession = useCallback(() => {
    stopPolling();
    setSessionId(null);
    setSessionInfo(null);
    setIsCoordinator(false);
    setMessages([]);
    setError(null);
  }, [stopPolling]);

  return {
    sessionId,
    sessionInfo,
    isCoordinator,
    isLoading,
    error,
    messages,
    createSession,
    getSessionInfo,
    closeSession,
    sendMessage,
    sendToCoordinator,
    startPolling,
    stopPolling,
    clearSession,
  };
}
