// Admin gate for /admin/* pages.
//
// The console API lives on the gateway and is authorised by a console JWT in
// the `console_jwt` cookie. A SaaS admin session can mint one through
// POST /saas/api/admin-grant. The cookie is intentionally NOT httpOnly: the
// admin pages' client scripts read it and send it as `Bearer` to /api/console/*.

import type { AstroGlobal } from 'astro';
import { apiGet, apiPost } from './saas';
import { getToken } from './session';

const CONSOLE_COOKIE = 'console_jwt';

/** Exchange the SaaS admin session for a console JWT and store it. */
export async function grantAdminFromSession(astro: Pick<AstroGlobal, 'cookies' | 'request' | 'url'>): Promise<boolean> {
  const token = getToken(astro);
  if (!token) return false;
  try {
    const data = await apiPost<{ token?: string }>('/saas/api/admin-grant', {}, token, astro.request);
    if (!data.token) return false;
    astro.cookies.set(CONSOLE_COOKIE, data.token, {
      httpOnly: false,
      secure: astro.url.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 3600,
    });
    return true;
  } catch {
    return false;
  }
}

/** True when the console JWT resolves to an admin role. */
export async function verifyConsoleSession(token: string, request: Request): Promise<boolean> {
  try {
    const data = await apiGet<{ role?: string }>('/console/api/session', token, request);
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Require an admin session. Returns a redirect Response when access is denied,
 * or null when the caller may proceed.
 */
export async function requireAdminPage(astro: AstroGlobal): Promise<Response | null> {
  const cookieToken = astro.cookies.get(CONSOLE_COOKIE)?.value;
  if (cookieToken && (await verifyConsoleSession(cookieToken, astro.request))) {
    return null;
  }
  if (cookieToken) astro.cookies.delete(CONSOLE_COOKIE, { path: '/' });

  if (await grantAdminFromSession(astro)) {
    const minted = astro.cookies.get(CONSOLE_COOKIE)?.value ?? '';
    if (await verifyConsoleSession(minted, astro.request)) return null;
  }
  return astro.redirect('/login?err=' + encodeURIComponent('Hanya akun admin yang bisa mengakses halaman ini.'));
}

export { CONSOLE_COOKIE };

/** Cookie name the console SPA (/console/) authenticates with. */
const CONSOLE_SPA_COOKIE = 'cartethyia_console';

/**
 * Mint a console JWT from a SaaS session token and return a Set-Cookie value for
 * the console SPA cookie, or null when the account is not an admin / the grant
 * fails. Used where a Response is built by hand (e.g. the OAuth redirect).
 */
export async function consoleSessionCookie(
  astro: Pick<AstroGlobal, 'request' | 'url'>,
  sessionToken: string,
): Promise<string | null> {
  try {
    const data = await apiPost<{ token?: string }>('/saas/api/admin-grant', {}, sessionToken, astro.request);
    if (!data.token) return null;
    const secure = astro.url.protocol === 'https:' ? '; Secure' : '';
    // Scoped to /console so it is only sent to the console SPA.
    return `${CONSOLE_SPA_COOKIE}=${data.token}; Path=/console; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`;
  } catch {
    return null;
  }
}

/**
 * Mint a console JWT from the SaaS session and set the cookie the console SPA
 * authenticates with.
 *
 * The console SPA (served at /console/) reads the `cartethyia_console` cookie;
 * the gateway's consoleAuth verifies it with the SAME secret /saas/api/admin-grant
 * signs with, so the token minted here is a valid console session. Setting it on
 * admin login lets an admin land straight on the console.
 */
export async function grantConsoleSession(
  astro: Pick<AstroGlobal, 'cookies' | 'request' | 'url'>,
  sessionToken: string,
): Promise<boolean> {
  try {
    const data = await apiPost<{ token?: string }>('/saas/api/admin-grant', {}, sessionToken, astro.request);
    if (!data.token) return false;
    astro.cookies.set(CONSOLE_SPA_COOKIE, data.token, {
      httpOnly: true,
      secure: astro.url.protocol === 'https:',
      sameSite: 'lax',
      // The console SPA lives under /console, so the cookie is scoped there.
      path: '/console',
      maxAge: 12 * 3600,
    });
    return true;
  } catch {
    return false;
  }
}
