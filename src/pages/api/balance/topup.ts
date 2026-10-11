// /api/balance/topup — create a balance top-up (POST).
//
// Relays the gateway response verbatim (status + JSON body) so the browser sees
// the payment provider payload unchanged. The `Idempotency-Key` request header
// is forwarded when the client supplies one.
import type { APIRoute } from 'astro';
import { getToken } from '../../../lib/api/session';
import { proxyFetch } from '../../../lib/api/saas';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const MIN_TOPUP_IDR = 10_000;

export const POST: APIRoute = async (ctx) => {
  const token = getToken(ctx);
  if (!token) return json({ error: { code: 'authentication', message: 'Unauthorized' } }, 401);

  const body: unknown = await ctx.request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: { code: 'invalid_request', message: 'Request tidak valid' } }, 400);
  }

  const rawAmount = 'amount' in body ? body.amount : undefined;
  const amount =
    typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount)
      ? rawAmount
      : typeof rawAmount === 'string' && /^[1-9]\d*$/.test(rawAmount) && Number.isSafeInteger(Number(rawAmount))
        ? Number(rawAmount)
        : undefined;

  if (amount === undefined || amount < MIN_TOPUP_IDR) {
    return json(
      { error: { code: 'invalid_request', message: `Nominal topup minimal Rp${MIN_TOPUP_IDR.toLocaleString('id-ID')}.` } },
      400,
    );
  }

  const idempotencyKey = 'idempotencyKey' in body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const method = 'method' in body && typeof body.method === 'string' ? body.method.trim() : '';
  const customerPhone =
    'customer_phone' in body && typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';

  const headers = new Headers({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  try {
    const upstream = await proxyFetch(
      '/saas/api/balance/topup',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: String(amount),
          ...(method ? { method } : {}),
          ...(customerPhone ? { customer_phone: customerPhone } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        }),
      },
      ctx.request,
    );
    const text = await upstream.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: { code: 'upstream_error', message: 'Layanan pembayaran sedang tidak tersedia.' } }, 502);
    }
    return json(parsed, upstream.status);
  } catch {
    return json({ error: { code: 'upstream_error', message: 'Layanan pembayaran sedang tidak tersedia.' } }, 502);
  }
};
