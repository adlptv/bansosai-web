// /api/oauth/[provider]/[action] — proxy the OAuth start/callback flow to the
// gateway (GET). PUBLIC: no session token is required.
//
// - `start` forwards the browser to the provider redirect and relays its
//   Location + Set-Cookie (signed state cookie) unchanged.
// - `callback` reads the gateway's redirect, and on success exchanges the
//   one-time handoff token for a session cookie, then bounces the browser to
//   /app or /admin based on the session role.
import type { APIRoute } from 'astro';
import { proxyFetch } from '../../../../lib/api/saas';

export const prerender = false;

const PROVIDER_ALLOWED: Record<string, true> = { google: true };
const ACTION_ALLOWED: Record<string, true> = { start: true, callback: true };

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function parseOAuthCallbackRedirect(location: string | null): { status: string; handoffToken?: string } {
  if (!location) return { status: 'error' };
  let url: URL;
  try {
    url = new URL(location, 'https://bansos.invalid');
  } catch {
    return { status: 'error' };
  }
  const oauth = url.searchParams.get('oauth');
  if (oauth === 'success') {
    const handoffToken = url.searchParams.get('handoff');
    if (handoffToken && handoffToken.length <= 2048) return { status: 'success', handoffToken };
    return { status: 'error' };
  }
  if (oauth && oauth.length <= 64) return { status: oauth };
  return { status: 'error' };
}

function oauthCallbackLocation(status: string, role: string): string {
  if (status !== 'success') return `/login?oauth=${encodeURIComponent(status)}`;
  return role === 'admin' ? '/admin' : '/app';
}

function forwardSetCookies(source: Headers, destination: Headers): void {
  const cookies = typeof source.getSetCookie === 'function' ? source.getSetCookie() : [];
  if (cookies.length > 0) {
    for (const cookie of cookies) destination.append('set-cookie', cookie);
    return;
  }
  const cookie = source.get('set-cookie');
  if (cookie) destination.set('set-cookie', cookie);
}

export const GET: APIRoute = async ({ params, request }) => {
  const provider = params.provider ?? '';
  const action = params.action ?? '';
  if (!PROVIDER_ALLOWED[provider] || !ACTION_ALLOWED[action]) {
    return errorResponse(404, 'OAuth route not found');
  }

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  const query = new URL(request.url).search;

  try {
    const upstream = await proxyFetch(
      `/saas/api/oauth/${provider}/${action}${query}`,
      { method: 'GET', headers, redirect: 'manual' },
      request,
    );

    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    forwardSetCookies(upstream.headers, responseHeaders);

    if (action !== 'callback') {
      const location = upstream.headers.get('location');
      if (location) responseHeaders.set('location', location);
      return new Response(null, { status: upstream.status, headers: responseHeaders });
    }

    const callback = parseOAuthCallbackRedirect(upstream.headers.get('location'));
    if (!callback.handoffToken) {
      responseHeaders.set('location', oauthCallbackLocation(callback.status, ''));
      return new Response(null, { status: 303, headers: responseHeaders });
    }

    const handoff = await proxyFetch(
      '/saas/api/oauth/handoff',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: callback.handoffToken }),
      },
      request,
    );
    forwardSetCookies(handoff.headers, responseHeaders);

    let role = '';
    if (handoff.ok) {
      const payload: unknown = await handoff.json().catch(() => null);
      if (payload && typeof payload === 'object' && 'role' in payload && typeof payload.role === 'string') {
        role = payload.role;
      }
    }

    responseHeaders.set('location', oauthCallbackLocation(handoff.ok ? 'success' : 'error', role));
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return new Response(null, {
      status: 303,
      headers: { location: '/login?oauth=error', 'cache-control': 'no-store' },
    });
  }
};
