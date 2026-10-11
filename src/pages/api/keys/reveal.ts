// /api/keys/reveal — reveal a key's secret, or import a legacy key.
import type { APIRoute } from 'astro';
import { getToken } from '../../../lib/api/session';
import { apiGet, apiPost } from '../../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const id = new URL(ctx.request.url).searchParams.get('id') ?? '';
  if (!id) return json({ error: 'id is required' }, 400);
  try {
    return json(await apiGet(`/saas/api/keys/${encodeURIComponent(id)}/reveal`, token, ctx.request));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 404);
  }
};

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: 'Unauthorized' }, 401);
  const body = await ctx.request.json().catch(() => ({}));
  try {
    return json(await apiPost('/saas/api/import-supporter', body, token, ctx.request));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 400);
  }
};
