// GET /api/oauth/google/callback — proxy the OAuth callback to the gateway.
//
// The gateway verifies the state cookie, then redirects the browser back to
// /login?oauth=success&handoff=<token>. We relay that Location and cookie
// unchanged; the login page then consumes the handoff server-side.

import type { APIRoute } from 'astro';
import { proxyOAuth } from '../../../../lib/api/auth';

export const prerender = false;

export const GET: APIRoute = ({ request }) => proxyOAuth('/saas/api/oauth/google/callback', request);
