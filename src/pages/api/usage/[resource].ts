// /api/usage/[resource] — proxy the dashboard usage endpoints (GET).
//
// The browser passes filters as query params; only the whitelisted params for
// the requested resource are forwarded to the gateway, so arbitrary query
// strings can never reach upstream.
import type { APIRoute } from 'astro';
import { getToken } from '../../../lib/api/session';
import { apiGet } from '../../../lib/api/saas';

export const prerender = false;

const ALLOWED_PARAMS: Record<UsageResource, readonly string[]> = {
  requests: ['from', 'to', 'model', 'provider', 'outcome', 'status', 'stream', 'limit', 'cursor', 'keyId'],
  summary: ['window'],
};

type UsageResource = 'requests' | 'summary';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function isUsageResource(value: string): value is UsageResource {
  return value === 'requests' || value === 'summary';
}

function usageUpstreamPath(resource: UsageResource, url: URL): string {
  const q = new URLSearchParams();
  for (const name of ALLOWED_PARAMS[resource]) {
    const value = url.searchParams.get(name);
    if (value !== null && value !== '') q.set(name, value);
  }
  const search = q.toString();
  return `/saas/api/usage/${resource}${search ? `?${search}` : ''}`;
}

export const GET: APIRoute = async (ctx) => {
  const resource = ctx.params.resource ?? '';
  if (!isUsageResource(resource)) {
    return json({ error: { code: 'not_found', message: 'Unknown usage resource.' } }, 404);
  }

  const token = getToken(ctx);
  if (!token) {
    return json({ error: { code: 'authentication', message: 'Unauthorized.' } }, 401);
  }

  try {
    const data = await apiGet(usageUpstreamPath(resource, new URL(ctx.request.url)), token, ctx.request);
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data pemakaian.';
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return json({ error: { code: 'upstream_rejected', message } }, status);
    }
    return json({ error: { code: 'upstream_unavailable', message } }, 502);
  }
};
