// /api/checkout — create a billing checkout for a plan (POST).
//
// The plan price is validated server-side against the gateway's plan catalog
// before forwarding, and the upstream response is normalized: HTML or malformed
// payloads never cross this same-origin boundary as JSON.
import type { APIRoute } from 'astro';
import { getToken } from '../../lib/api/session';
import { apiGet, proxyFetch } from '../../lib/api/saas';

export const prerender = false;

const JSON_MEDIA_TYPE = /^(?:application\/json|[^;\s]+\+json)(?:\s*;|\s*$)/i;

const envelope = (error: { code: string; message: string }, status: number): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/**
 * Convert untrusted checkout upstream output into the one JSON contract the
 * browser consumes. HTML and malformed payloads become a safe error envelope.
 */
async function normalizeCheckoutResponse(upstream: Response): Promise<Response> {
  const contentType = upstream.headers.get('content-type') || '';
  const text = await upstream.text();
  if (JSON_MEDIA_TYPE.test(contentType)) {
    try {
      JSON.parse(text);
      return new Response(text, {
        status: upstream.ok || (upstream.status >= 400 && upstream.status < 500) ? upstream.status : 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    } catch {
      // Fall through to a safe envelope; never expose malformed JSON to the client.
    }
  }
  const safeStatus = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
  return envelope(
    {
      code: 'CHECKOUT_UPSTREAM_INVALID_RESPONSE',
      message: 'Layanan pembayaran mengembalikan respons yang tidak valid.',
    },
    safeStatus,
  );
}

async function normalizeCheckoutFetch(fetchUpstream: () => Promise<Response>): Promise<Response> {
  try {
    return await normalizeCheckoutResponse(await fetchUpstream());
  } catch {
    return envelope(
      { code: 'CHECKOUT_UPSTREAM_UNAVAILABLE', message: 'Layanan pembayaran sedang tidak tersedia.' },
      502,
    );
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const body: unknown = await ctx.request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Request tidak valid' }, 400);

  const planCode = 'planCode' in body && typeof body.planCode === 'string' ? body.planCode.trim() : '';
  const period = 'period' in body && typeof body.period === 'string' ? body.period.trim() : '';
  const idempotencyKey =
    'idempotencyKey' in body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const rawAmount = 'amount' in body ? body.amount : undefined;
  const amount =
    typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount) && rawAmount > 0
      ? rawAmount
      : typeof rawAmount === 'string' && /^[1-9]\d*$/.test(rawAmount) && Number.isSafeInteger(Number(rawAmount))
        ? Number(rawAmount)
        : undefined;

  if (!planCode || !period || amount === undefined) {
    return json({ error: 'Jumlah harus berupa integer IDR positif yang aman.' }, 400);
  }

  try {
    // Plan catalog is public upstream: an empty token means no Authorization
    // header is attached (mirrors the pre-rebuild `apiGet(path, undefined, …)`).
    const planData = await apiGet<{ plans?: { code?: string; period?: string; priceIdr?: number }[] }>(
      '/saas/api/plans',
      '',
      ctx.request,
    );
    const plan = (planData.plans ?? []).find((candidate) => candidate.code === planCode && candidate.period === period);
    const minimum = plan?.priceIdr;
    if (!plan || typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || amount < minimum) {
      return json({ error: 'Jumlah harus minimal sesuai harga plan yang dipilih.' }, 400);
    }

    const headers = new Headers({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

    return await normalizeCheckoutFetch(() =>
      proxyFetch(
        '/saas/api/billing/checkout',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            planCode,
            period,
            amount: String(amount),
            ...(idempotencyKey ? { idempotencyKey } : {}),
          }),
        },
        ctx.request,
      ),
    );
  } catch {
    return json(
      { error: { code: 'CHECKOUT_UPSTREAM_UNAVAILABLE', message: 'Layanan pembayaran sedang tidak tersedia.' } },
      502,
    );
  }
};
