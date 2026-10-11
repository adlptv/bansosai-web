// Session helpers for the dashboard (`/app`) and admin panel (`/admin`).
//
// The session token lives in an httpOnly cookie (`bns_session`) set by the web
// tier; server pages read it, resolve the user through the gateway, and never
// expose the token to client JS.

import type { AstroGlobal } from 'astro';
import { apiGet, apiPost } from './saas';
import { SESSION_COOKIE } from './server';

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  role: string;
  createdAt?: string;
  username?: string;
  hasPassword?: boolean;
  isSupporter?: boolean;
}

/** The raw session token from the request cookies, if present. */
export function getToken(astro: Pick<AstroGlobal, 'cookies'>): string | undefined {
  return astro.cookies.get(SESSION_COOKIE)?.value || undefined;
}

/** Persist the session token as an httpOnly cookie. */
export function setSession(astro: Pick<AstroGlobal, 'cookies' | 'url'>, token: string): void {
  astro.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: astro.url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}

/** Clear the session cookie. */
export function clearSession(astro: Pick<AstroGlobal, 'cookies'>): void {
  astro.cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Resolve the signed-in user, or null when there is no valid session. */
export async function getSessionUser(astro: Pick<AstroGlobal, 'cookies' | 'request'>): Promise<SessionUser | null> {
  const token = getToken(astro);
  if (!token) return null;
  try {
    const data = await apiGet<{ user?: SessionUser }>('/saas/api/me', token, astro.request);
    const candidate = data?.user;
    if (candidate && typeof candidate.email === 'string') return candidate;
    return null;
  } catch {
    return null;
  }
}

/** Revoke the session server-side, then clear the cookie locally. */
export async function logoutEverywhere(astro: Pick<AstroGlobal, 'cookies' | 'request'>): Promise<void> {
  const token = getToken(astro);
  if (token) {
    try {
      await apiPost('/saas/api/logout', {}, token, astro.request);
    } catch {
      /* best effort: clearing the cookie is what the user sees */
    }
  }
  clearSession(astro);
}
