/**
 * FROST Client Library
 *
 * TypeScript client for the frostd REST API and WebSocket server.
 */

// Main client class
export { FrostClient, type FrostClientEvent, type FrostClientEventHandler } from './client';

// Mock client for demo mode
export { MockFrostClient } from './mock-client';

// WebSocket client
export {
  WsClient,
  type WsClientConfig,
  type ConnectionState,
  type WsEventHandler,
  type ConnectionStateHandler,
} from './websocket-client';

// HTTP client (for advanced usage)
export { HttpClient } from './http-client';

// Error types
export {
  FrostClientError,
  NetworkError,
  AuthenticationError,
  SessionError,
  EncryptionError,
  ProtocolError,
  isFrostClientError,
  toFrostClientError,
} from './errors';

// Re-export types for convenience
export type {
  FrostdConfig,
  RequestOptions,
  ApiResponse,
} from '@/types';
