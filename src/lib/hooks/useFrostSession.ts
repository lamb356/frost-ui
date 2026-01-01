/**
 * useFrostSession Hook
 *
 * Manages an active FROST signing session:
 * - Session creation and joining
 * - Message polling
 * - Participant status updates
 * - Error handling and reconnection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrostStore } from '@/lib/store';
import { FrostClient, WsClient } from '@/lib/frost-client';
import type {
  SessionId,
  SessionInfo,
  SessionRole,
  ParticipantInfo,
  EncryptedMessage,
  SigningCommitment,
  FrostSignatureShare,
  MessageType,
} from '@/types';
import { decryptMessage, encryptMessage } from '@/lib/crypto';

// =============================================================================
// Types
// =============================================================================

export interface UseFrostSessionOptions {
  /** Enable WebSocket for real-time updates (default: true) */
  useWebSocket?: boolean;
  /** Polling interval in ms when WebSocket unavailable (default: 2000) */
  pollInterval?: number;
  /** Message long-poll timeout in seconds (default: 30) */
  longPollTimeout?: number;
}

export interface UseFrostSessionResult {
  // Session state
  session: SessionInfo | null;
  role: SessionRole | null;
  participants: ParticipantInfo[];
  inviteCode: string | null;
  isLoading: boolean;
  error: string | null;

  // Collected data
  commitments: SigningCommitment[];
  signatureShares: FrostSignatureShare[];

  // Actions
  createSession: (
    name: string,
    threshold: number,
    maxParticipants: number
  ) => Promise<{ sessionId: string; inviteCode: string } | null>;
  joinSession: (sessionId: SessionId, inviteCode: string) => Promise<boolean>;
  leaveSession: () => Promise<void>;
  closeSession: () => Promise<void>;

  // Signing actions
  startSigning: (message: string, signerIds: number[]) => Promise<boolean>;
  submitCommitment: (commitment: SigningCommitment) => Promise<boolean>;
  submitSignatureShare: (share: FrostSignatureShare) => Promise<boolean>;

  // Messaging
  sendEncryptedMessage: (
    recipient: string,
    messageType: MessageType,
    payload: unknown
  ) => Promise<boolean>;

  // Refresh
  refreshSession: () => Promise<void>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFrostSession(
  options: UseFrostSessionOptions = {}
): UseFrostSessionResult {
  const {
    useWebSocket = true,
    pollInterval = 2000,
    longPollTimeout = 30,
  } = options;

  // Store state
  const {
    frostdUrl,
    accessToken,
    pubkey,
    sessionId: storedSessionId,
    session: storedSession,
    role: storedRole,
    participants: storedParticipants,
    inviteCode: storedInviteCode,
    setActiveSession,
    updateSession,
    updateParticipants,
    clearActiveSession,
    addError,
  } = useFrostStore();

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<SigningCommitment[]>([]);
  const [signatureShares, setSignatureShares] = useState<FrostSignatureShare[]>([]);

  // Refs
  const clientRef = useRef<FrostClient | null>(null);
  const wsClientRef = useRef<WsClient | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const privateKeyRef = useRef<string | null>(null);

  // Initialize clients
  useEffect(() => {
    if (!accessToken) {
      clientRef.current = null;
      return;
    }

    // Create REST client
    const client = new FrostClient({ baseUrl: frostdUrl });
    client.setToken(accessToken);
    clientRef.current = client;

    // Create WebSocket client if enabled
    if (useWebSocket) {
      const wsUrl = frostdUrl.replace(/^http/, 'ws') + '/ws';
      const wsClient = new WsClient({
        url: wsUrl,
        token: accessToken,
      });
      wsClientRef.current = wsClient;

      // Connect and subscribe to session if active
      wsClient.connect().then(() => {
        if (storedSessionId) {
          wsClient.subscribe(storedSessionId);
        }
      }).catch((err) => {
        console.warn('WebSocket connection failed, falling back to polling:', err);
      });
    }

    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
      }
    };
  }, [frostdUrl, accessToken, useWebSocket, storedSessionId]);

  // Set up message polling or WebSocket handlers
  useEffect(() => {
    if (!storedSessionId || !clientRef.current) {
      return;
    }

    // If WebSocket is connected, use event handlers
    if (wsClientRef.current?.isConnected()) {
      const unsubscribeSession = wsClientRef.current.onSessionUpdated((event) => {
        if (event.sessionId === storedSessionId) {
          updateSession(event.payload.session);
        }
      });

      const unsubscribeMessage = wsClientRef.current.on('message_received', (event) => {
        if (event.sessionId === storedSessionId) {
          handleReceivedMessage(event.payload as EncryptedMessage);
        }
      });

      return () => {
        unsubscribeSession();
        unsubscribeMessage();
      };
    }

    // Otherwise, fall back to polling
    const poll = async () => {
      if (!clientRef.current || !storedSessionId) return;

      try {
        // Poll for messages
        const { messages } = await clientRef.current.receiveMessages({
          sessionId: storedSessionId,
          afterMessageId: lastMessageIdRef.current ?? undefined,
          timeout: longPollTimeout,
        });

        for (const message of messages) {
          handleReceivedMessage(message);
          lastMessageIdRef.current = message.id;
        }

        // Refresh session info periodically
        const { session } = await clientRef.current.getSessionInfo(storedSessionId);
        updateSession(session);
        updateParticipants(session.participants);
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Start polling
    poll();
    pollIntervalRef.current = setInterval(poll, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [storedSessionId, pollInterval, longPollTimeout, updateSession, updateParticipants]);

  // Handle received encrypted message
  const handleReceivedMessage = useCallback(async (message: EncryptedMessage) => {
    if (!privateKeyRef.current) {
      console.warn('Cannot decrypt message: no private key available');
      return;
    }

    try {
      // Decrypt the message
      const decryptedJson = await decryptMessage(
        message.senderPubkey,
        message.ciphertext,
        message.nonce,
        privateKeyRef.current
      );

      const payload = JSON.parse(decryptedJson);

      // Handle based on message type
      switch (message.messageType) {
        case 'commitment':
          setCommitments((prev) => {
            const existing = prev.find(
              (c) => c.participantId === payload.participantId
            );
            if (existing) return prev;
            return [...prev, payload as SigningCommitment];
          });
          break;

        case 'signature_share':
          setSignatureShares((prev) => {
            const existing = prev.find(
              (s) => s.participantId === payload.participantId
            );
            if (existing) return prev;
            return [...prev, payload as FrostSignatureShare];
          });
          break;

        case 'ack':
        case 'error':
          // Handle acknowledgments and errors
          console.log('Received:', message.messageType, payload);
          break;
      }
    } catch (err) {
      console.error('Failed to decrypt message:', err);
    }
  }, []);

  // Create session
  const createSession = useCallback(
    async (
      name: string,
      threshold: number,
      maxParticipants: number
    ): Promise<{ sessionId: string; inviteCode: string } | null> => {
      if (!clientRef.current) {
        setError('Not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await clientRef.current.createSession({
          name,
          threshold,
          maxParticipants,
        });

        setActiveSession(response.session, 'coordinator', response.inviteCode);

        // Subscribe to session via WebSocket
        if (wsClientRef.current?.isConnected()) {
          wsClientRef.current.subscribe(response.session.sessionId);
        }

        return {
          sessionId: response.session.sessionId,
          inviteCode: response.inviteCode,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        setError(message);
        addError({ code: 'UNKNOWN_ERROR', message });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setActiveSession, addError]
  );

  // Join session
  const joinSession = useCallback(
    async (sessionId: SessionId, inviteCode: string): Promise<boolean> => {
      if (!clientRef.current) {
        setError('Not connected');
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await clientRef.current.joinSession(sessionId, inviteCode);

        setActiveSession(response.session, 'participant');

        // Subscribe to session via WebSocket
        if (wsClientRef.current?.isConnected()) {
          wsClientRef.current.subscribe(sessionId);
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join session';
        setError(message);
        addError({ code: 'SESSION_NOT_FOUND', message });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [setActiveSession, addError]
  );

  // Leave session
  const leaveSession = useCallback(async (): Promise<void> => {
    if (wsClientRef.current && storedSessionId) {
      wsClientRef.current.unsubscribe(storedSessionId);
    }

    // Clear local state
    setCommitments([]);
    setSignatureShares([]);
    lastMessageIdRef.current = null;

    clearActiveSession();
  }, [storedSessionId, clearActiveSession]);

  // Close session (coordinator only)
  const closeSession = useCallback(async (): Promise<void> => {
    if (!clientRef.current || !storedSessionId) {
      return;
    }

    setIsLoading(true);

    try {
      await clientRef.current.closeSession(storedSessionId);
    } catch (err) {
      console.error('Failed to close session:', err);
    } finally {
      await leaveSession();
      setIsLoading(false);
    }
  }, [storedSessionId, leaveSession]);

  // Start signing
  const startSigning = useCallback(
    async (message: string, signerIds: number[]): Promise<boolean> => {
      if (!clientRef.current || !storedSessionId) {
        setError('No active session');
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        await clientRef.current.startSigning({
          sessionId: storedSessionId,
          message,
          signerIds,
        });

        // Clear previous round data
        setCommitments([]);
        setSignatureShares([]);

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start signing';
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [storedSessionId]
  );

  // Submit commitment
  const submitCommitment = useCallback(
    async (commitment: SigningCommitment): Promise<boolean> => {
      if (!clientRef.current || !storedSessionId) {
        setError('No active session');
        return false;
      }

      try {
        const response = await clientRef.current.submitCommitment(
          storedSessionId,
          commitment
        );

        if (response.accepted) {
          setCommitments((prev) => [...prev, commitment]);
        }

        return response.accepted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit commitment';
        setError(message);
        return false;
      }
    },
    [storedSessionId]
  );

  // Submit signature share
  const submitSignatureShare = useCallback(
    async (share: FrostSignatureShare): Promise<boolean> => {
      if (!clientRef.current || !storedSessionId) {
        setError('No active session');
        return false;
      }

      try {
        const response = await clientRef.current.submitSignatureShare(
          storedSessionId,
          share
        );

        if (response.accepted) {
          setSignatureShares((prev) => [...prev, share]);
        }

        return response.accepted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit signature share';
        setError(message);
        return false;
      }
    },
    [storedSessionId]
  );

  // Send encrypted message
  const sendEncryptedMessage = useCallback(
    async (
      recipient: string,
      messageType: MessageType,
      payload: unknown
    ): Promise<boolean> => {
      if (!clientRef.current || !storedSessionId) {
        setError('No active session');
        return false;
      }

      try {
        // Encrypt the message
        const encrypted = await encryptMessage(recipient, JSON.stringify(payload));

        await clientRef.current.sendMessage({
          sessionId: storedSessionId,
          recipient,
          messageType,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        return false;
      }
    },
    [storedSessionId]
  );

  // Refresh session info
  const refreshSession = useCallback(async (): Promise<void> => {
    if (!clientRef.current || !storedSessionId) {
      return;
    }

    try {
      const { session, commitments: fetchedCommitments, signatureShares: fetchedShares } =
        await clientRef.current.getSessionInfo(storedSessionId);

      updateSession(session);
      updateParticipants(session.participants);

      if (fetchedCommitments) {
        setCommitments(fetchedCommitments);
      }
      if (fetchedShares) {
        setSignatureShares(fetchedShares);
      }
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  }, [storedSessionId, updateSession, updateParticipants]);

  return {
    session: storedSession,
    role: storedRole,
    participants: storedParticipants,
    inviteCode: storedInviteCode,
    isLoading,
    error,
    commitments,
    signatureShares,
    createSession,
    joinSession,
    leaveSession,
    closeSession,
    startSigning,
    submitCommitment,
    submitSignatureShare,
    sendEncryptedMessage,
    refreshSession,
  };
}
