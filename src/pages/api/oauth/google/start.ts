// GET /api/oauth/google/start — proxy the OAuth start to the gateway.
//
// The gateway builds the provider redirect and sets the signed state cookie for
// this web origin, so both must be relayed unchanged.

import type { APIRoute } from 'astro';
import { proxyOAuth } from '../../../../lib/api/auth';

export const prerender = false;

export const GET: APIRoute = ({ request }) => proxyOAuth('/saas/api/oauth/google/start', request);
