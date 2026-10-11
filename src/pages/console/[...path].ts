// /console/* — serve the operator dashboard through the public site.
//
// The console SPA and its API live on the gateway. The browser must reach both
// on the SAME origin (bansosai.app), because the console session is a
// same-origin cookie and the SPA's API calls are relative (/console/api/...).
// Without this route the public site answered 404 and /console/ was unreachable.
//
// Everything under /console/ is forwarded verbatim: the SPA HTML, its hashed
// assets, and the console API. The gateway owns auth; this route only relays.

import type { APIRoute } from 'astro';
import { resolveApiBase } from '../../lib/api/client';
import { serverEnv } from '../../lib/api/server';

export const prerender = false;

// Hop-by-hop and length headers are recomputed for the relayed response.
const DROP_REQUEST_HEADERS: Record<string, true> = {
  host: true,
  connection: true,
  'content-length': true,
  'accept-encoding': true,
  'transfer-encoding': true,
};
const DROP_RESPONSE_HEADERS: Record<string, true> = {
  'content-length': true,
  'content-encoding': true,
  'transfer-encoding': true,
  connection: true,
};

async function proxyConsole(request: Request, rest: string): Promise<Response> {
  const base = resolveApiBase(serverEnv());
  const url = new URL(request.url);
  const target = `${base}/console/${rest}${url.search}`;

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!DROP_REQUEST_HEADERS[key.toLowerCase()]) headers.set(key, value);
  }
  // Ask upstream for an unencoded body so the buffered relay stays simple.
  headers.set('accept-encoding', 'identity');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
  } catch {
    return new Response('Gateway unreachable', { status: 502 });
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const out = new Headers();
  for (const [key, value] of upstream.headers) {
    if (!DROP_RESPONSE_HEADERS[key.toLowerCase()]) out.set(key, value);
  }
  out.set('content-length', String(buffer.length));

  // Re-emit the console session cookie for this origin, adding Secure on HTTPS.
  const cookies = upstream.headers.getSetCookie();
  if (cookies.length > 0) {
    out.delete('set-cookie');
    const secure = url.protocol === 'https:';
    for (const cookie of cookies) {
      out.append('set-cookie', secure && !/;\s*secure/i.test(cookie) ? `${cookie}; Secure` : cookie);
    }
  }

  return new Response(buffer, { status: upstream.status, headers: out });
}

export const ALL: APIRoute = ({ request, params }) => proxyConsole(request, params.path ?? '');
