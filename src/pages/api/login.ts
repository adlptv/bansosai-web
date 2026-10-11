// POST /api/login — session login (form post), parity route.
//
// Kept alongside /api/auth/login so both entry points work. On success the
// session cookie is set and the user is sent to the dashboard (admins to the
// admin panel).
import type { APIRoute } from 'astro';
import { apiPost } from '../../lib/api/saas';
import { setSession } from '../../lib/api/session';
import { isSameOrigin } from '../../lib/api/auth';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!isSameOrigin(ctx.request, ctx.site?.toString() ?? import.meta.env.SITE)) {
    return new Response('Forbidden', { status: 403 });
  }
  const form = await ctx.request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  if (!email || !password) {
    return ctx.redirect(`/login?err=${encodeURIComponent('Email dan password wajib diisi.')}`, 303);
  }
  try {
    const data = await apiPost<{ token?: string; user?: { role?: string } }>(
      '/saas/api/login',
      { email, password },
      undefined,
      ctx.request,
    );
    if (!data.token) throw new Error('Login gagal.');
    setSession(ctx, data.token);
    return ctx.redirect(data.user?.role === 'admin' ? '/admin' : '/app', 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login gagal.';
    return ctx.redirect(`/login?err=${encodeURIComponent(message)}`, 303);
  }
};
