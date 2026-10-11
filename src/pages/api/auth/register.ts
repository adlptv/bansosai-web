// POST /api/auth/register — server-side registration proxy.
//
// Registration does not return a session token (the gateway requires a separate
// login), so on success the user is sent to /login with a success notice.

import type { APIRoute } from 'astro';
import { getApi } from '../../../lib/api/server';
import { redirectWith } from '../../../lib/api/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const turnstileToken = String(form.get('turnstileToken') ?? '');

  if (!email || !password) {
    return redirectWith(`/register?error=${encodeURIComponent('Email dan password wajib diisi.')}`);
  }

  try {
    await getApi().register(email, password, turnstileToken || undefined);
    return redirectWith(`/login?registered=1&email=${encodeURIComponent(email)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mendaftar.';
    return redirectWith(`/register?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`);
  }
};
