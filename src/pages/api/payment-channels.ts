// /api/payment-channels — available payment methods (GET).
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiGet } from '../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: { code: 'authentication', message: 'Unauthorized' } }, 401);
  try {
    return json(await apiGet('/saas/api/payment-channels', token, ctx.request));
  } catch {
    return json({ error: { code: 'upstream_error', message: 'Gagal memuat metode pembayaran' } }, 400);
  }
};
