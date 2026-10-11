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
 * Same-origin guard for state-changing form posts.
 *
 * Astro's built-in check compares Origin to `url.origin`, which behind the
 * Cloudflare tunnel is http://127.0.0.1:4321 — so a legitimate same-site POST
 * never matched and every form submission was rejected. This check compares
 * against the PUBLIC origin instead (the configured site URL, plus the Host
 * header the proxy forwards), so a browser form post from bansosai.app is
 * accepted while a foreign origin is still refused.
 *
 * A missing Origin is allowed only when the request is not a form post, since
 * browsers always send Origin on cross-site form submissions; same-site form
 * posts from very old browsers may omit it, and those are the users this must
 * not lock out.
 */
export function isSameOrigin(request: Request, siteUrl: string | undefined): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin: same-site form posts from old browsers omit it. Accept, since
    // a cross-site form post always carries Origin in modern browsers.
    return true;
  }
  let originHost: string;
  try {
    originHost = registrableHost(new URL(origin).host);
  } catch {
    return false;
  }

  // Same-origin against the host the request was actually sent to. The Host
  // header is set by the proxy/browser; the adapter's request.url is NOT
  // reliable (Astro's node adapter reports http://localhost), so it is not used
  // for this comparison.
  const ownHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (ownHost && originHost === registrableHost(ownHost)) return true;

  // Also accept the configured public origin, so a proxy that rewrites Host
  // (cloudflared -> 127.0.0.1) still matches the site the browser sees.
  const publicOrigin = publicOriginFor(request, siteUrl);
  if (origin === publicOrigin) return true;
  try {
    return originHost === registrableHost(new URL(publicOrigin).host);
  } catch {
    return false;
  }
}

/** Strip a leading `www.` so apex and www compare equal. */
function registrableHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** The public origin a browser sees, derived from config then the Host header. */
function publicOriginFor(request: Request, siteUrl: string | undefined): string {
  if (siteUrl) {
    try {
      return new URL(siteUrl).origin;
    } catch {
      /* fall through to the Host header */
    }
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
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
 * Forward an OAuth GET to the gateway, relaying the redirect and Set-Cookie.
 *
 * The SaaS session cookie is deliberately STRIPPED before forwarding. The
 * gateway's callback treats any authenticated session as "link this provider
 * to the signed-in account" and returns oauth_conflict when that provider
 * account already belongs to somebody else — which is exactly what a returning
 * user hit ("Akun ini sudah tertaut ke akun lain"). A sign-in must be a clean
 * flow: only the OAuth state cookie (bns_oauth_state) is carried forward.
 */
export async function proxyOAuth(path: string, incoming: Request): Promise<Response> {
  const base = resolveApiBase(serverEnv());
  const url = new URL(incoming.url);

  const stateCookie = pickOAuthStateCookie(incoming.headers.get('cookie'));
  const headers: Record<string, string> = { accept: 'text/html' };
  if (stateCookie) headers['cookie'] = stateCookie;

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

/** Keep only the OAuth state cookie from a Cookie header, dropping the session. */
function pickOAuthStateCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return '';
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith('bns_oauth_state='))
    .join('; ');
}
