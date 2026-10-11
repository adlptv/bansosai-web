// /api/cancel-payment — cancel a pending billing order (POST).
//
// The gateway response is relayed verbatim (status + body) so the browser sees
// the provider's cancellation payload unchanged.
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { proxyFetch } from '../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: { code: 'authentication', message: 'Unauthorized' } }, 401);

  const body: unknown = await ctx.request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: { code: 'invalid_request', message: 'Request tidak valid' } }, 400);
  }
  const rawOrderId = 'orderId' in body ? body.orderId : undefined;
  const orderId = typeof rawOrderId === 'string' ? rawOrderId.trim() : '';
  if (!orderId) {
    return json({ error: { code: 'invalid_request', message: 'orderId wajib diisi' } }, 400);
  }

  try {
    return await proxyFetch(
      '/saas/api/billing/cancel',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      },
      ctx.request,
    );
  } catch {
    return json(
      { error: { code: 'CANCEL_UPSTREAM_UNAVAILABLE', message: 'Layanan pembayaran sedang tidak tersedia.' } },
      502,
    );
  }
};
