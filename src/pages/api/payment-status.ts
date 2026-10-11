// /api/payment-status — poll a billing order's status (GET ?orderId=...).
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiGet } from '../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: { code: 'authentication', message: 'Unauthorized' } }, 401);

  const orderId = new URL(ctx.request.url).searchParams.get('orderId')?.trim() ?? '';
  if (!orderId) return json({ error: { code: 'invalid_request', message: 'orderId wajib diisi' } }, 400);

  try {
    return json(await apiGet(`/saas/api/billing/status/${encodeURIComponent(orderId)}`, token, ctx.request));
  } catch (e) {
    return json(
      { error: { code: 'upstream_error', message: e instanceof Error ? e.message : 'Gagal memuat status pembayaran' } },
      400,
    );
  }
};
