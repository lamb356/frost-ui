/**
 * FROST Client Error Classes
 */

import type { FrostError, FrostErrorCode } from '@/types';

/**
 * Base error class for FROST client errors.
 */
export class FrostClientError extends Error {
  readonly code: FrostErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: FrostErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FrostClientError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FrostClientError);
    }
  }

  /**
   * Create from a FrostError object.
   */
  static fromFrostError(error: FrostError): FrostClientError {
    return new FrostClientError(error.code, error.message, error.details);
  }

  /**
   * Convert to a plain FrostError object.
   */
  toFrostError(): FrostError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Network-related errors (connection failed, timeout, etc.)
 */
export class NetworkError extends FrostClientError {
  readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super('NETWORK_ERROR', message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Authentication errors (invalid credentials, expired token, etc.)
 */
export class AuthenticationError extends FrostClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NOT_AUTHORIZED', message, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Session-related errors
 */
export class SessionError extends FrostClientError {
  readonly sessionId?: string;

  constructor(code: FrostErrorCode, message: string, sessionId?: string) {
    super(code, message, sessionId ? { sessionId } : undefined);
    this.name = 'SessionError';
    this.sessionId = sessionId;
  }
}

/**
 * Encryption/decryption errors
 */
export class EncryptionError extends FrostClientError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ENCRYPTION_ERROR', message, details);
    this.name = 'EncryptionError';
  }
}

/**
 * FROST protocol errors (invalid commitments, shares, etc.)
 */
export class ProtocolError extends FrostClientError {
  constructor(code: FrostErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ProtocolError';
  }
}

/**
 * Check if an error is a FrostClientError.
 */
export function isFrostClientError(error: unknown): error is FrostClientError {
  return error instanceof FrostClientError;
}

/**
 * Convert any error to a FrostClientError.
 */
export function toFrostClientError(error: unknown): FrostClientError {
  if (isFrostClientError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new FrostClientError('UNKNOWN_ERROR', error.message);
  }

  return new FrostClientError('UNKNOWN_ERROR', String(error));
}
