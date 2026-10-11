// /api/redeem — redeem a promo/voucher code (POST).
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiPost } from '../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: { code: 'authentication', message: 'Unauthorized' } }, 401);

  const body = await ctx.request.json().catch(() => ({}));
  try {
    return json(await apiPost('/saas/api/redeem', body, token, ctx.request));
  } catch (error) {
    return json(
      { error: { code: 'redeem', message: error instanceof Error ? error.message : 'Redeem gagal' } },
      400,
    );
  }
};
