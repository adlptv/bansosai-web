// Server-side accessors for the shared API client and the session cookie.
//
// Pages import `getApi()` rather than constructing a client, so base-URL and
// timeout policy live in exactly one place (the client module).

import { apiClientFromEnv, type ApiClient } from './client';

// The gateway sets and reads this cookie name for the SaaS session, so the web
// tier must use the same one for the server-side session proxy to work.
export const SESSION_COOKIE = 'bns_session';

/** The shared API client, configured from the server environment. */
export function getApi(): ApiClient {
  return apiClientFromEnv(serverEnv());
}

/**
 * Read the server environment. Server-side vars are NOT baked into
 * import.meta.env (only PUBLIC_-prefixed ones are), so the authoritative API
 * base must be read from process.env at request time; import.meta.env is still
 * consulted so a build-time override keeps working.
 */
export function serverEnv(): Record<string, string | undefined> {
  return {
    ...(import.meta.env as unknown as Record<string, string | undefined>),
    ...(typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {}),
  };
}
