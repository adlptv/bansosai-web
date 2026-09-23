// Parity contract: server-side API client boundary.
//
// This module is the ONLY place the web tier talks to the API. Pages must not
// build cross-service requests themselves, because that spreads base-URL,
// authentication, timeout, and error-mapping knowledge across the codebase.
//
// Status: interface only. The implementation is written after the plan's
// evidence gates pass, and it must never accept or store database credentials.

/** Base URL of the authoritative API for production SaaS reads and writes. */
export interface ApiClientOptions {
  /** Absolute base URL, for example the authoritative API origin. */
  baseUrl: string;
  /** Request timeout in milliseconds; every call must be bounded. */
  timeoutMs: number;
}

/** Stable error vocabulary so callers do not string-match upstream messages. */
export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'storage'
  | 'dependency_timeout'
  | 'unknown';

export interface ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
}

/**
 * Create the shared API client.
 *
 * Deliberately unimplemented: the transport, authentication, and response
 * decoding are decided together with the contract mapping, not before it.
 */
export function createApiClient(_options: ApiClientOptions): never {
  throw new Error('not implemented: pending contract mapping');
}
