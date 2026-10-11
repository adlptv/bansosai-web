// /api/logout — revoke the session server-side and clear the cookie.
import type { APIRoute } from 'astro';
import { logoutEverywhere } from '../../lib/api/session';

export const prerender = false;

const handler: APIRoute = async (ctx) => {
  await logoutEverywhere(ctx);
  return ctx.redirect('/', 303);
};

export const GET = handler;
export const POST = handler;
