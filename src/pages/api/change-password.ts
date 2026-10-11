// /api/change-password — change the signed-in user's password.
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiPost } from '../../lib/api/saas';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return ctx.redirect('/login', 303);
  const form = await ctx.request.formData();
  try {
    await apiPost(
      '/saas/api/change-password',
      {
        currentPassword: String(form.get('currentPassword') ?? ''),
        newPassword: String(form.get('newPassword') ?? ''),
      },
      token,
      ctx.request,
    );
    return ctx.redirect(`/app/settings?msg=${encodeURIComponent('Password berhasil diganti. Perangkat lain sudah logout.')}`, 303);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal mengganti password.';
    return ctx.redirect(`/app/settings?err=${encodeURIComponent(message)}`, 303);
  }
};
