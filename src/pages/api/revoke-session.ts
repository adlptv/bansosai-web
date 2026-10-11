// /api/revoke-session — revoke another of the user's sessions (DELETE ?id=...).
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiDelete } from '../../lib/api/saas';

export const prerender = false;

export const DELETE: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = new URL(ctx.request.url).searchParams.get('id') ?? '';
  try {
    const data = await apiDelete(`/saas/api/sessions/${id}`, token, ctx.request);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'error' }), { status: 400 });
  }
};
