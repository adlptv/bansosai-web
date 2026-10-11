// POST /api/login — session login (form post), parity route.
//
// On success the session cookie is set and the user is sent to the right place:
// an admin to the admin dashboard (/admin), everyone else to /app. A `next`
// field lets any user choose their destination.
import type { APIRoute } from 'astro';
import { apiPost } from '../../lib/api/saas';
import { setSession } from '../../lib/api/session';
import { isSameOrigin } from '../../lib/api/auth';

export const prerender = false;

// Only site-relative destinations are honoured, so a crafted `next` cannot turn
// the login into an open redirect.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

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

    const isAdmin = data.user?.role === 'admin';
    const next = safeNext(String(form.get('next') ?? '') || null);
    if (next) return ctx.redirect(next, 303);
    return ctx.redirect(isAdmin ? '/admin' : '/app', 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login gagal.';
    return ctx.redirect(`/login?err=${encodeURIComponent(message)}`, 303);
  }
};
