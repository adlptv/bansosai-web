// Server-side SaaS API client for the dashboard (`/app`) and admin panel
// (`/admin`). Distinct from the public client: it carries the session token and
// signs the client-IP provenance the gateway requires.
//
// The gateway binds a request's client IP to a signed header set
// (X-Internal-Client-IP*). When the internal proxy is enabled and ANY of those
// headers is present, the gateway either accepts a fully valid signature or
// fails closed to RemoteAddr — so the signature must match exactly:
//
//   HMAC-SHA256(secret, [METHOD, RequestURI, timestamp, nonce, clientIp, sha256(body)].join("\n"))
//
// Secret = SAAS_INTERNAL_PROXY_SECRET, base = API_INTERNAL_URL.

export interface ApiError extends Error {
  status: number;
  code?: string;
}

class ApiRequestError extends Error implements ApiError {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const PUBLIC_BASE = 'https://api.bansosai.app';
const encoder = new TextEncoder();

function runtimeEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

const INTERNAL_BASE = runtimeEnv('API_INTERNAL_URL');
const SIGNING_SECRET = runtimeEnv('SAAS_INTERNAL_PROXY_SECRET');

const PROVENANCE_HEADERS = [
  'x-internal-client-ip',
  'x-internal-client-ip-timestamp',
  'x-internal-client-ip-nonce',
  'x-internal-client-ip-body-sha256',
  'x-internal-client-ip-signature',
];
const FORWARDED_CLIENT_IP_HEADER = 'cf-connecting-ip';

// ── IP canonicalization (must match the gateway byte-for-byte) ──────────────

function parseHexGroup(group: string): number | undefined {
  if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return undefined;
  return parseInt(group, 16);
}

function canonicalizeIpv4(raw: string): string | undefined {
  const parts = raw.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part)) return undefined;
    if (part.length > 1 && part[0] === '0') return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    octets.push(n);
  }
  return octets.join('.');
}

function stringifyIpv6(groups: number[]): string {
  if (groups.length === 8 && groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 65535) {
    return `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
  }
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < 8) {
    if (groups[i] === 0) {
      let j = i;
      while (j < 8 && groups[j] === 0) j++;
      const len = j - i;
      if (len > bestLen) {
        bestLen = len;
        bestStart = i;
      }
      i = j;
    } else {
      i++;
    }
  }
  if (bestLen >= 2) {
    const left = groups.slice(0, bestStart).map((g) => g.toString(16));
    const right = groups.slice(bestStart + bestLen).map((g) => g.toString(16));
    return `${left.join(':')}::${right.join(':')}`;
  }
  return groups.map((g) => g.toString(16)).join(':');
}

function canonicalizeIpv6(raw: string): string | undefined {
  let hexPart = raw;
  let ipv4Tail: number[] | null = null;
  const lastColon = raw.lastIndexOf(':');
  if (lastColon !== -1) {
    const tail = raw.slice(lastColon + 1);
    if (tail.includes('.')) {
      const v4 = canonicalizeIpv4(tail);
      if (v4 === undefined) return undefined;
      const o = v4.split('.').map(Number);
      ipv4Tail = [((o[0]! << 8) | o[1]!) & 65535, ((o[2]! << 8) | o[3]!) & 65535];
      hexPart = raw.slice(0, lastColon);
    }
  }
  const expectedHexGroups = ipv4Tail ? 6 : 8;
  const groups: number[] = [];
  const dc = hexPart.indexOf('::');
  if (dc !== -1) {
    if (hexPart.indexOf('::', dc + 2) !== -1) return undefined;
    const leftArr = hexPart.slice(0, dc) === '' ? [] : hexPart.slice(0, dc).split(':');
    const rightArr = hexPart.slice(dc + 2) === '' ? [] : hexPart.slice(dc + 2).split(':');
    for (const g of leftArr) {
      const n = parseHexGroup(g);
      if (n === undefined) return undefined;
      groups.push(n);
    }
    const zeros = expectedHexGroups - (leftArr.length + rightArr.length);
    if (zeros < 0) return undefined;
    for (let k = 0; k < zeros; k++) groups.push(0);
    for (const g of rightArr) {
      const n = parseHexGroup(g);
      if (n === undefined) return undefined;
      groups.push(n);
    }
  } else {
    const arr = hexPart === '' ? [] : hexPart.split(':');
    if (arr.length !== expectedHexGroups) return undefined;
    for (const g of arr) {
      const n = parseHexGroup(g);
      if (n === undefined) return undefined;
      groups.push(n);
    }
  }
  if (ipv4Tail) groups.push(ipv4Tail[0]!, ipv4Tail[1]!);
  if (groups.length !== 8) return undefined;
  return stringifyIpv6(groups);
}

function canonicalizeIp(value: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed !== value) return undefined;
  if (/[\s,]/.test(trimmed)) return undefined;
  if (trimmed.includes(':')) return canonicalizeIpv6(trimmed);
  if (trimmed.includes('.')) return canonicalizeIpv4(trimmed);
  return undefined;
}

function deriveClientIp(headers: Headers): string | undefined {
  return canonicalizeIp(headers.get(FORWARDED_CLIENT_IP_HEADER));
}

// ── Signing ─────────────────────────────────────────────────────────────────

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildProvenanceHeaders(input: {
  secret: string;
  method: string;
  requestUri: string;
  clientIp: string;
  bodyBytes: Uint8Array;
}): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonce();
  const bodySha256 = await sha256Hex(input.bodyBytes);
  const canonical = [input.method, input.requestUri, timestamp, nonce, input.clientIp, bodySha256].join('\n');
  const signature = await hmacSha256Hex(input.secret, canonical);
  return {
    'X-Internal-Client-IP': input.clientIp,
    'X-Internal-Client-IP-Timestamp': timestamp,
    'X-Internal-Client-IP-Nonce': nonce,
    'X-Internal-Client-IP-Body-SHA256': bodySha256,
    'X-Internal-Client-IP-Signature': signature,
  };
}

function bodyBytesOf(init: RequestInit): Uint8Array | undefined {
  if (init.body == null) return new Uint8Array(0);
  if (typeof init.body === 'string') return encoder.encode(init.body);
  // The /api/console/* proxy reads the raw request body as an ArrayBuffer
  // before forwarding it. Without these branches a POST/PATCH body would fail
  // to produce bytes, the request would not be signed, and it would fall back
  // to the public base instead of the internal one.
  if (init.body instanceof Uint8Array) return init.body;
  if (init.body instanceof ArrayBuffer) return new Uint8Array(init.body);
  if (ArrayBuffer.isView(init.body)) {
    return new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
  }
  return undefined;
}

function mergeHeaders(init: RequestInit, token?: string): Headers {
  const headers = new Headers(init.headers);
  for (const name of PROVENANCE_HEADERS) headers.delete(name);
  headers.delete(FORWARDED_CLIENT_IP_HEADER);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

async function signedFetch(path: string, init: RequestInit, token?: string, incomingRequest?: Request): Promise<Response> {
  const headers = mergeHeaders(init, token);
  const method = (init.method ?? 'GET').toUpperCase();
  const clientIp = incomingRequest ? deriveClientIp(incomingRequest.headers) : undefined;

  let base = PUBLIC_BASE;
  let signed = false;
  if (INTERNAL_BASE && SIGNING_SECRET && incomingRequest) {
    const bytes = clientIp ? bodyBytesOf(init) : undefined;
    if (clientIp && bytes) {
      base = INTERNAL_BASE;
      signed = true;
      const provenance = await buildProvenanceHeaders({
        secret: SIGNING_SECRET,
        method,
        requestUri: path,
        clientIp,
        bodyBytes: bytes,
      });
      for (const [name, value] of Object.entries(provenance)) headers.set(name, value);
    }
  } else if (INTERNAL_BASE && SIGNING_SECRET && !incomingRequest) {
    base = INTERNAL_BASE;
  }

  headers.delete(FORWARDED_CLIENT_IP_HEADER);
  if (!signed && clientIp) headers.set(FORWARDED_CLIENT_IP_HEADER, clientIp);

  return fetch(`${base}${path}`, { ...init, method, headers });
}

async function request<T>(path: string, init: RequestInit, token?: string, incomingRequest?: Request): Promise<T> {
  const response = await signedFetch(path, init, token, incomingRequest);
  const data = (await response.json().catch(() => ({}))) as { error?: string | { code?: string; message?: string } };
  if (!response.ok) {
    const err = data.error;
    const detail = typeof err === 'string' ? err : err?.message;
    throw new ApiRequestError(detail ?? `Request gagal (${response.status})`, response.status, typeof err === 'object' ? err?.code : undefined);
  }
  return data as T;
}

/** GET as the signed-in user. */
export function apiGet<T>(path: string, token?: string, incoming?: Request): Promise<T> {
  return request<T>(path, { method: 'GET' }, token, incoming);
}

/** POST JSON as the signed-in user. */
export function apiPost<T>(path: string, body: unknown, token?: string, incoming?: Request): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, token, incoming);
}

/** PUT JSON as the signed-in user. */
export function apiPut<T>(path: string, body: unknown, token?: string, incoming?: Request): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }, token, incoming);
}

/** PATCH JSON as the signed-in user. */
export function apiPatch<T>(path: string, body: unknown, token?: string, incoming?: Request): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }, token, incoming);
}

/** DELETE as the signed-in user. */
export function apiDelete<T>(path: string, token?: string, incoming?: Request): Promise<T> {
  return request<T>(path, { method: 'DELETE' }, token, incoming);
}

/** Relay a raw request (used by the admin `/api/console/*` proxy). */
export function proxyFetch(path: string, init: RequestInit, incoming?: Request): Promise<Response> {
  return signedFetch(path, init, undefined, incoming);
}

export { ApiRequestError };
