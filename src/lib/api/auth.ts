// Server-side auth helpers for the public site.
//
// The web tier never stores credentials: it forwards to the API gateway and
// relays the gateway's session cookie to the browser as an httpOnly cookie.
// This keeps the token out of client JS (no localStorage) while letting the
// browser carry the session on subsequent requests.

import { resolveApiBase } from './client';
import { serverEnv } from './server';
import { SESSION_COOKIE } from './server';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matching the gateway

/** Build a Set-Cookie value for the gateway session token. */
export function sessionCookie(token: string, secure: boolean): string {
  let cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
  if (secure) cookie += '; Secure';
  return cookie;
}

/** Build the cookie that clears the session. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** A 302 to a site-relative path, optionally setting cookies. */
export function redirectWith(path: string, cookies: string[] = []): Response {
  const headers = new Headers({ location: path, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

/**
 * Exchange a one-time OAuth handoff token for a session.
 *
 * The gateway sets the session cookie on its own response; we read it back out
 * of Set-Cookie and return the raw token so the caller can re-emit it for this
 * origin (the web tier, not the gateway, owns the browser-facing cookie).
 */
export async function consumeHandoff(
  token: string,
): Promise<{ ok: boolean; role: string; sessionToken: string | null }> {
  const base = resolveApiBase(serverEnv());
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/saas/api/oauth/handoff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return { ok: false, role: 'user', sessionToken: null };
  }
  if (!upstream.ok) return { ok: false, role: 'user', sessionToken: null };

  let role = 'user';
  try {
    const body = (await upstream.json()) as { role?: string };
    if (body.role) role = body.role;
  } catch {
    /* keep default role */
  }

  // Pull the session token out of the gateway's Set-Cookie.
  let sessionToken: string | null = null;
  for (const sc of upstream.headers.getSetCookie()) {
    const m = /^bns_session=([^;]+)/.exec(sc);
    if (m?.[1]) sessionToken = m[1];
  }
  return { ok: true, role, sessionToken };
}

/**
 * Transparently proxy an OAuth GET to the gateway, relaying BOTH the redirect
 * Location and any Set-Cookie headers.
 *
 * The gateway builds its redirect_uri and state cookie for the public web
 * origin, so the browser must receive the gateway's Location and cookie
 * unchanged — rewriting either would break the state check.
 */
export async function proxyOAuth(path: string, incoming: Request): Promise<Response> {
  const base = resolveApiBase(serverEnv());
  const url = new URL(incoming.url);

  // Forward the client's cookies so the gateway sees the OAuth state cookie.
  const headers: Record<string, string> = { accept: 'text/html' };
  const cookie = incoming.headers.get('cookie');
  if (cookie) headers['cookie'] = cookie;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${path}${url.search}`, { headers, redirect: 'manual' });
  } catch {
    return redirectWith('/login?oauth=oauth_error');
  }

  const location = upstream.headers.get('location');
  const out = new Headers({ 'cache-control': 'no-store' });
  if (location) out.set('location', location);
  for (const sc of upstream.headers.getSetCookie()) out.append('set-cookie', sc);
  return new Response(null, { status: location ? 302 : upstream.status, headers: out });
}
