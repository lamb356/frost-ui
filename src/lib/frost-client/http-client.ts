/**
 * HTTP Client for frostd REST API
 *
 * Handles authentication, request/response formatting, and error handling.
 * Matches the official frostd spec: https://frost.zfnd.org/zcash/server.html
 */

import type { FrostdConfig, RequestOptions, FrostError } from '@/types/api';
import { FrostClientError, NetworkError, AuthenticationError, type ClientErrorCode } from './errors';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * HTTP client for communicating with frostd server.
 */
export class HttpClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private defaultTimeout: number;

  constructor(config: FrostdConfig) {
    // Remove trailing slash from base URL
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.accessToken = config.accessToken ?? null;
    this.defaultTimeout = config.defaultTimeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Set the authentication token.
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * Get the current authentication token.
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Check if client is authenticated.
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Make a POST request to the frostd API (authenticated).
   */
  async post<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    if (!this.accessToken) {
      throw new AuthenticationError('Not authenticated');
    }

    return this.request<TRequest, TResponse>(endpoint, data, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
  }

  /**
   * Make a POST request without authentication (for /challenge and /login).
   */
  async postUnauthenticated<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    return this.request<TRequest, TResponse>(endpoint, data, options);
  }

  /**
   * Internal request method.
   */
  private async request<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = options.timeout ?? this.defaultTimeout;

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    // Combine with external signal if provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Handle error responses (status 500 returns FrostError)
      if (!response.ok) {
        const errorData = await this.tryParseError(response);
        throw this.handleApiError(errorData, response.status);
      }

      // Parse successful response
      // Some endpoints return empty response
      const text = await response.text();
      if (!text) {
        return {} as TResponse;
      }

      try {
        return JSON.parse(text) as TResponse;
      } catch {
        throw new FrostClientError('PARSE_ERROR', 'Failed to parse JSON response');
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw FrostClientErrors
      if (error instanceof FrostClientError) {
        throw error;
      }

      // Handle fetch errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError('Request timed out');
        }
        throw new NetworkError(`Network request failed: ${error.message}`, error);
      }

      throw new NetworkError('Unknown network error');
    }
  }

  /**
   * Try to parse error response body.
   */
  private async tryParseError(response: Response): Promise<FrostError | null> {
    try {
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text) as FrostError;
    } catch {
      return null;
    }
  }

  /**
   * Handle API error responses.
   */
  private handleApiError(error: FrostError | null, statusCode: number): FrostClientError {
    // Handle frostd error format
    if (error && typeof error.code === 'number') {
      const codeMap: Record<number, ClientErrorCode> = {
        1: 'INVALID_ARGUMENT',
        2: 'NOT_AUTHORIZED',
        3: 'SESSION_NOT_FOUND',
        4: 'NOT_COORDINATOR',
      };
      const code: ClientErrorCode = codeMap[error.code] || 'UNKNOWN_ERROR';

      if (error.code === 2) {
        return new AuthenticationError(error.msg || 'Unauthorized');
      }

      return new FrostClientError(code, error.msg || 'Unknown error');
    }

    // Handle missing error object
    if (statusCode === 401 || statusCode === 403) {
      return new AuthenticationError('Unauthorized');
    }

    return new FrostClientError('UNKNOWN_ERROR', `Request failed with status ${statusCode}`);
  }
}
