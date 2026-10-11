// POST /api/auth/register — server-side registration proxy.
//
// Registration does not return a session token (the gateway requires a separate
// login), so on success the user is sent to /login with a success notice.

import type { APIRoute } from 'astro';
import { getApi } from '../../../lib/api/server';
import { redirectWith, isSameOrigin } from '../../../lib/api/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, site }) => {
  // CSRF guard (see login.ts for why Astro's built-in check is off).
  if (!isSameOrigin(request, site?.toString() ?? import.meta.env.SITE)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  // Turnstile injects its token under this name when the form is submitted.
  const turnstileToken = String(form.get('cf-turnstile-response') ?? form.get('turnstileToken') ?? '');

  const fail = (message: string) =>
    redirectWith(`/register?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`);

  if (!email || !password) return fail('Email dan password wajib diisi.');
  if (confirm && confirm !== password) return fail('Konfirmasi password tidak cocok.');
  if (!turnstileToken) return fail('Selesaikan verifikasi captcha terlebih dahulu.');

  try {
    await getApi().register(email, password, turnstileToken);
    return redirectWith(`/login?registered=1&email=${encodeURIComponent(email)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mendaftar.';
    return fail(message);
  }
};
