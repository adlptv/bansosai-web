// POST /api/register — account registration (form post), parity route.
//
// Requires the Cloudflare Turnstile token the register page injects; the
// gateway verifies it against TURNSTILE_SECRET.
import type { APIRoute } from 'astro';
import { apiPost } from '../../lib/api/saas';
import { isSameOrigin } from '../../lib/api/auth';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!isSameOrigin(ctx.request, ctx.site?.toString() ?? import.meta.env.SITE)) {
    return new Response('Forbidden', { status: 403 });
  }
  const form = await ctx.request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  if (!email || !password || password.length < 8) {
    return ctx.redirect(`/register?err=${encodeURIComponent('Email dan password minimal 8 karakter wajib diisi.')}`, 303);
  }
  if (password !== confirm) {
    return ctx.redirect(`/register?err=${encodeURIComponent('Konfirmasi password tidak sama.')}`, 303);
  }
  const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
  try {
    await apiPost('/saas/api/register', { email, password, turnstileToken }, undefined, ctx.request);
    return ctx.redirect('/login?registered=1', 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Pendaftaran gagal.';
    return ctx.redirect(`/register?err=${encodeURIComponent(message)}`, 303);
  }
};
