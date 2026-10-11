// GET /api/announcements/poster/[name] — same-origin proxy for banner media.
//
// The poster files live on the API host. Serving them through this origin keeps
// the public page free of cross-origin requests and lets the browser cache them
// under the site's own domain. Media may be an image or a short video, so Range
// requests are forwarded: video players need them to start playback without
// downloading the whole file first.

import type { APIRoute } from 'astro';
import { resolveApiBase } from '../../../../lib/api/client';
import { serverEnv } from '../../../../lib/api/server';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const name = params.name ?? '';
  // Reject anything that is not a bare filename before it reaches the API.
  if (!name || name !== name.split(/[\\/]/).pop()) {
    return new Response('not found', { status: 404 });
  }

  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  let upstream: Response;
  try {
    upstream = await fetch(`${resolveApiBase(serverEnv())}/saas/api/announcements/poster/${encodeURIComponent(name)}`, { headers });
  } catch {
    return new Response('upstream unavailable', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('not found', { status: 404 });
  }

  const out = new Headers();
  for (const key of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  // Random poster names never change content, so they are safe to cache long.
  out.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
