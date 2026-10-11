// /api/chat — streaming playground proxy to the gateway's OpenAI-compatible
// chat completions endpoint (POST). Authenticates with the user-supplied
// `bns_*` API key, not the session cookie, so the browser never talks to the
// gateway cross-origin. The upstream body is streamed through unchanged.
import type { APIRoute } from 'astro';
import { proxyFetch } from '../../lib/api/saas';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body: unknown = await request.json().catch(() => null);

  const apiKey = body && typeof body === 'object' && 'apiKey' in body && typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = body && typeof body === 'object' && 'model' in body && typeof body.model === 'string' ? body.model.trim() : '';
  const messages = body && typeof body === 'object' && 'messages' in body && Array.isArray(body.messages) ? body.messages : [];
  const wantsStream = !(body && typeof body === 'object' && 'stream' in body && body.stream === false);

  if (!apiKey.startsWith('bns_') || !model || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: 'invalid_request', message: 'apiKey bns_*, model, and messages are required' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const upstreamResponse = await proxyFetch(
    '/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: wantsStream }),
    },
    request,
  ).catch(
    (error) =>
      new Response(
        JSON.stringify({
          error: { code: 'upstream_error', message: error instanceof Error ? error.message : 'Gateway unreachable' },
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      ),
  );

  const headers = new Headers(upstreamResponse.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-cache');
  return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers });
};
