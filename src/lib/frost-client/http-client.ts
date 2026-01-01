/**
 * HTTP Client for frostd REST API
 *
 * Handles authentication, request/response formatting, and error handling.
 */

import type {
  FrostdConfig,
  RequestOptions,
  ApiResponse,
  FrostError,
} from '@/types';
import { FrostClientError, NetworkError, AuthenticationError } from './errors';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * HTTP client for communicating with frostd server.
 */
export class HttpClient {
  private baseUrl: string;
  private token: string | null = null;
  private defaultTimeout: number;

  constructor(config: FrostdConfig) {
    // Remove trailing slash from base URL
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token ?? null;
    this.defaultTimeout = config.defaultTimeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Set the authentication token.
   */
  setToken(token: string | null): void {
    this.token = token;
  }

  /**
   * Get the current authentication token.
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if client is authenticated.
   */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Make a POST request to the frostd API.
   */
  async post<TRequest, TResponse>(
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

      // Add auth token if available
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const responseData = await this.parseResponse<ApiResponse<TResponse>>(response);

      // Handle error responses
      if (!responseData.success || responseData.error) {
        throw this.handleApiError(responseData.error, response.status);
      }

      // Return the data
      if (responseData.data === undefined) {
        throw new FrostClientError('UNKNOWN_ERROR', 'Response missing data field');
      }

      return responseData.data;
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
   * Make a POST request without authentication (for login/challenge).
   */
  async postUnauthenticated<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = options.timeout ?? this.defaultTimeout;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

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

      const responseData = await this.parseResponse<ApiResponse<TResponse>>(response);

      if (!responseData.success || responseData.error) {
        throw this.handleApiError(responseData.error, response.status);
      }

      if (responseData.data === undefined) {
        throw new FrostClientError('UNKNOWN_ERROR', 'Response missing data field');
      }

      return responseData.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof FrostClientError) {
        throw error;
      }

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
   * Parse response body as JSON.
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      throw new FrostClientError(
        'UNKNOWN_ERROR',
        `Unexpected response type: ${contentType}. Body: ${text.slice(0, 200)}`
      );
    }

    try {
      return await response.json() as T;
    } catch {
      throw new FrostClientError('UNKNOWN_ERROR', 'Failed to parse JSON response');
    }
  }

  /**
   * Handle API error responses.
   */
  private handleApiError(error: FrostError | undefined, statusCode: number): FrostClientError {
    // Handle missing error object
    if (!error) {
      if (statusCode === 401) {
        return new AuthenticationError('Unauthorized');
      }
      if (statusCode === 403) {
        return new AuthenticationError('Forbidden');
      }
      return new FrostClientError('UNKNOWN_ERROR', `Request failed with status ${statusCode}`);
    }

    // Convert API error to client error
    if (error.code === 'NOT_AUTHORIZED') {
      return new AuthenticationError(error.message, error.details);
    }

    return FrostClientError.fromFrostError(error);
  }

  /**
   * Create a long-polling request for receiving messages.
   */
  async longPoll<TRequest, TResponse>(
    endpoint: string,
    data: TRequest,
    pollTimeout: number,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    // For long polling, we need a longer timeout
    return this.post<TRequest, TResponse>(endpoint, data, {
      ...options,
      timeout: pollTimeout + 5000, // Add 5s buffer for network latency
    });
  }
}
