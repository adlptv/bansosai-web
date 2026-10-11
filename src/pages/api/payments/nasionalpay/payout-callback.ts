// /api/payments/nasionalpay/payout-callback — payout notification webhook
// (POST). PUBLIC: authenticated by the provider's signature in the body/headers,
// not a session cookie. Relays the raw body to the gateway and returns its
// response.
import type { APIRoute } from 'astro';
import { proxyFetch } from '../../../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function proxyNasionalpayCallback(path: string, request: Request, proxy: typeof proxyFetch): Promise<Response> {
  const body = await request.text().catch(() => '');
  const contentType = request.headers.get('content-type') ?? 'application/json';
  const headers = new Headers({ 'content-type': contentType });
  try {
    const upstream = await proxy(path, { method: 'POST', headers, body }, request);
    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) responseHeaders.set('content-type', upstreamType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json({ ok: false, error: 'upstream_unavailable' }, 502);
  }
}

export const POST: APIRoute = (ctx) =>
  proxyNasionalpayCallback('/saas/api/payments/nasionalpay/payout-callback', ctx.request, proxyFetch);
