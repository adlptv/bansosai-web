// /api/console/* — proxy the console (admin) API to the gateway.
//
// Admin pages run client-side scripts that call /api/console/* with the console
// JWT as a Bearer token. This route relays them to the gateway, which owns the
// auth check. Same-origin so the browser needs no CORS.
import type { APIRoute } from 'astro';
import { proxyFetch } from '../../../lib/api/saas';

export const prerender = false;

const DROP_REQUEST: Record<string, true> = {
  host: true,
  connection: true,
  'content-length': true,
  'accept-encoding': true,
  'transfer-encoding': true,
};
const DROP_RESPONSE: Record<string, true> = {
  'content-length': true,
  'content-encoding': true,
  'transfer-encoding': true,
  connection: true,
};

export const ALL: APIRoute = async ({ request, params }) => {
  const path = params.path ?? '';
  const url = new URL(request.url);

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!DROP_REQUEST[key.toLowerCase()]) headers.set(key, value);
  }
  headers.set('accept-encoding', 'identity');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await proxyFetch(`/console/api/${path}${url.search}`, { method: request.method, headers, body }, request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gateway unreachable';
    return new Response(JSON.stringify({ error: { code: 'upstream_error', message } }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const out = new Headers();
  for (const [key, value] of upstream.headers) {
    if (!DROP_RESPONSE[key.toLowerCase()]) out.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
