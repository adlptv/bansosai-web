// GET /api/announcements/poster/[name] — same-origin proxy for banner posters.
//
// The poster files live on the API host. Serving them through this origin keeps
// the public page free of cross-origin requests and lets the browser cache them
// under the site's own domain.

import type { APIRoute } from 'astro';
import { resolveApiBase } from '../../../../lib/api/client';
import { serverEnv } from '../../../../lib/api/server';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? '';
  // Reject anything that is not a bare filename before it reaches the API.
  if (!name || name !== name.split(/[\\/]/).pop()) {
    return new Response('not found', { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${resolveApiBase(serverEnv())}/saas/api/announcements/poster/${encodeURIComponent(name)}`);
  } catch {
    return new Response('upstream unavailable', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('not found', { status: 404 });
  }

  const headers = new Headers();
  const type = upstream.headers.get('content-type');
  if (type) headers.set('content-type', type);
  // Random poster names never change content, so they are safe to cache long.
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(upstream.body, { status: 200, headers });
};
