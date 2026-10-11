// /api/set-password — set a password for a Google-only account.
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiPost } from '../../lib/api/saas';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return ctx.redirect('/login', 303);
  const form = await ctx.request.formData();
  try {
    await apiPost('/saas/api/set-password', { newPassword: String(form.get('newPassword') ?? '') }, token, ctx.request);
    return ctx.redirect('/app', 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal menyimpan password.';
    return ctx.redirect(`/app/set-password?err=${encodeURIComponent(message)}`, 303);
  }
};
