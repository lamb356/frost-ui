/**
 * WebSocket Client for frostd Real-time Updates
 *
 * Provides real-time session updates, message delivery, and event streaming.
 */

import type {
  SessionId,
  WsEvent,
  WsEventType,
  SessionUpdatedPayload,
  ParticipantJoinedPayload,
  SigningCompletedPayload,
} from '@/types';
import { NetworkError } from './errors';

/** WebSocket connection state */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/** WebSocket client configuration */
export interface WsClientConfig {
  /** WebSocket server URL */
  url: string;
  /** Authentication token */
  token: string;
  /** Reconnection attempts before giving up */
  maxReconnectAttempts?: number;
  /** Base delay between reconnection attempts (ms) */
  reconnectDelay?: number;
  /** Maximum reconnection delay (ms) */
  maxReconnectDelay?: number;
  /** Ping interval (ms) */
  pingInterval?: number;
}

/** Event handler for specific event types */
export type WsEventHandler<T = unknown> = (event: WsEvent<T>) => void;

/** Connection state change handler */
export type ConnectionStateHandler = (state: ConnectionState) => void;

/**
 * WebSocket client for real-time frostd updates.
 */
export class WsClient {
  private config: Required<WsClientConfig>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingTimeout: ReturnType<typeof setInterval> | null = null;
  private subscribedSessions: Set<SessionId> = new Set();

  // Event handlers
  private eventHandlers: Map<WsEventType | '*', Set<WsEventHandler>> = new Map();
  private stateHandlers: Set<ConnectionStateHandler> = new Set();

  constructor(config: WsClientConfig) {
    this.config = {
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      pingInterval: config.pingInterval ?? 30000,
      ...config,
    };
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to the WebSocket server.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'connected') {
        resolve();
        return;
      }

      this.setState('connecting');

      try {
        // Create WebSocket with auth token in query string
        const url = new URL(this.config.url);
        url.searchParams.set('token', this.config.token);

        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setState('connected');
          this.startPingInterval();

          // Resubscribe to sessions
          for (const sessionId of this.subscribedSessions) {
            this.sendSubscribe(sessionId);
          }

          resolve();
        };

        this.ws.onclose = (event) => {
          this.stopPingInterval();

          if (event.wasClean) {
            this.setState('disconnected');
          } else {
            this.handleDisconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (this.state === 'connecting') {
            reject(new NetworkError('Failed to connect to WebSocket server'));
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.setState('disconnected');
        reject(new NetworkError('Failed to create WebSocket connection'));
      }
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
    this.subscribedSessions.clear();
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  // ===========================================================================
  // Session Subscriptions
  // ===========================================================================

  /**
   * Subscribe to updates for a session.
   */
  subscribe(sessionId: SessionId): void {
    this.subscribedSessions.add(sessionId);

    if (this.isConnected()) {
      this.sendSubscribe(sessionId);
    }
  }

  /**
   * Unsubscribe from updates for a session.
   */
  unsubscribe(sessionId: SessionId): void {
    this.subscribedSessions.delete(sessionId);

    if (this.isConnected()) {
      this.sendUnsubscribe(sessionId);
    }
  }

  /**
   * Get list of subscribed sessions.
   */
  getSubscribedSessions(): SessionId[] {
    return Array.from(this.subscribedSessions);
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Subscribe to all events.
   */
  onEvent(handler: WsEventHandler): () => void {
    return this.addEventHandler('*', handler);
  }

  /**
   * Subscribe to specific event type.
   */
  on<T = unknown>(eventType: WsEventType, handler: WsEventHandler<T>): () => void {
    return this.addEventHandler(eventType, handler as WsEventHandler);
  }

  /**
   * Subscribe to session updated events.
   */
  onSessionUpdated(handler: WsEventHandler<SessionUpdatedPayload>): () => void {
    return this.on('session_updated', handler);
  }

  /**
   * Subscribe to participant joined events.
   */
  onParticipantJoined(handler: WsEventHandler<ParticipantJoinedPayload>): () => void {
    return this.on('participant_joined', handler);
  }

  /**
   * Subscribe to signing completed events.
   */
  onSigningCompleted(handler: WsEventHandler<SigningCompletedPayload>): () => void {
    return this.on('signing_completed', handler);
  }

  /**
   * Subscribe to connection state changes.
   */
  onStateChange(handler: ConnectionStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private addEventHandler(key: WsEventType | '*', handler: WsEventHandler): () => void {
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set());
    }
    this.eventHandlers.get(key)!.add(handler);

    return () => {
      const handlers = this.eventHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      for (const handler of this.stateHandlers) {
        try {
          handler(state);
        } catch (error) {
          console.error('Error in state handler:', error);
        }
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data) as WsEvent;

      // Handle ping/pong
      if ((event as unknown as { type: string }).type === 'pong') {
        return;
      }

      // Emit to specific handlers
      const specificHandlers = this.eventHandlers.get(event.type);
      if (specificHandlers) {
        for (const handler of specificHandlers) {
          try {
            handler(event);
          } catch (error) {
            console.error('Error in event handler:', error);
          }
        }
      }

      // Emit to wildcard handlers
      const wildcardHandlers = this.eventHandlers.get('*');
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          try {
            handler(event);
          } catch (error) {
            console.error('Error in event handler:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleDisconnect(): void {
    this.stopPingInterval();

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.setState('reconnecting');

      // Exponential backoff
      const delay = Math.min(
        this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay
      );

      this.reconnectAttempts++;

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch(() => {
          // Reconnection failed, will retry
        });
      }, delay);
    } else {
      this.setState('disconnected');
      console.error('Max reconnection attempts reached');
    }
  }

  private startPingInterval(): void {
    this.pingTimeout = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.config.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingTimeout) {
      clearInterval(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  private send(message: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private sendSubscribe(sessionId: SessionId): void {
    this.send({ type: 'subscribe', sessionId });
  }

  private sendUnsubscribe(sessionId: SessionId): void {
    this.send({ type: 'unsubscribe', sessionId });
  }
}
