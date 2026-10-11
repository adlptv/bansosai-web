// POST /api/auth/login — server-side login proxy.
//
// The password never touches client storage: the browser posts it here, the
// web tier forwards it to the gateway, and the returned session token is
// relayed as an httpOnly cookie (never exposed to JS).

import type { APIRoute } from 'astro';
import { getApi } from '../../../lib/api/server';
import { sessionCookie, redirectWith, isSameOrigin } from '../../../lib/api/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, site }) => {
  // CSRF guard (Astro's own is disabled because it cannot see the proxied
  // origin). A foreign origin must not be able to post a login form here.
  if (!isSameOrigin(request, site?.toString() ?? import.meta.env.SITE)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/app');

  if (!email || !password) {
    return redirectWith(`/login?error=${encodeURIComponent('Email dan password wajib diisi.')}`);
  }

  const secure = url.protocol === 'https:';
  try {
    const res = await getApi().login(email, password);
    return redirectWith(next, [sessionCookie(res.token, secure)]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal masuk.';
    return redirectWith(`/login?error=${encodeURIComponent(message)}`);
  }
};
