// POST /api/login — session login (form post), parity route.
//
// On success the session cookie is set. An admin also gets a console session
// (cartethyia_console) so they land on the console by default; a `next` field
// lets any user choose their destination (e.g. "Lihat sebagai user").
import type { APIRoute } from 'astro';
import { apiPost } from '../../lib/api/saas';
import { setSession } from '../../lib/api/session';
import { grantConsoleSession } from '../../lib/api/admin';
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
    if (isAdmin) {
      // Give the console SPA a valid session too, so /console/ opens directly.
      await grantConsoleSession(ctx, data.token);
    }

    const next = safeNext(String(form.get('next') ?? '') || null);
    if (next) return ctx.redirect(next, 303);
    return ctx.redirect(isAdmin ? '/console/' : '/app', 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login gagal.';
    return ctx.redirect(`/login?err=${encodeURIComponent(message)}`, 303);
  }
};
