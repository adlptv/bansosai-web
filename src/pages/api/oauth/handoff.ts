// /api/oauth/handoff — exchange a one-time OAuth handoff token for a session
// cookie (POST). PUBLIC: no session token is required; the handoff token in the
// body is the credential. Relays the gateway's Set-Cookie and body unchanged.
import type { APIRoute } from 'astro';
import { proxyFetch } from '../../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    !body.token
  ) {
    return json({ error: 'OAuth handoff tidak valid.' }, 400);
  }

  try {
    const upstream = await proxyFetch(
      '/saas/api/oauth/handoff',
      { method: 'POST', body: JSON.stringify({ token: body.token }) },
      request,
    );

    const headers = new Headers({ 'cache-control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);

    const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
    if (cookies.length) headers.append('set-cookie', cookies.join(', '));
    else {
      const cookie = upstream.headers.get('set-cookie');
      if (cookie) headers.set('set-cookie', cookie);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'OAuth handoff gagal.' }, 502);
  }
};
