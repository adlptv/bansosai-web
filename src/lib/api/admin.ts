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
