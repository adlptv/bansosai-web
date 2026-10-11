// Parity contract: server-side API client boundary.
//
// This module is the ONLY place the web tier talks to the API. Pages must not
// build cross-service requests themselves, because that spreads base-URL,
// authentication, timeout, and error-mapping knowledge across the codebase.
//
// The web tier never holds database credentials: every read and write goes
// through the authoritative API gateway (API_INTERNAL_URL), over loopback in
// production so the request never leaves the host.

/** Base URL of the authoritative API for production SaaS reads and writes. */
export interface ApiClientOptions {
  /** Absolute base URL, for example the authoritative API origin. */
  baseUrl: string;
  /** Request timeout in milliseconds; every call must be bounded. */
  timeoutMs: number;
}

/** Stable error vocabulary so callers do not string-match upstream messages. */
export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'storage'
  | 'dependency_timeout'
  | 'unknown';

export interface ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
}

class ApiClientError extends Error implements ApiError {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(kind: ApiErrorKind, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Map an HTTP status to the stable error vocabulary. */
function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 500:
    case 502:
      return 'storage';
    case 503:
    case 504:
      return 'dependency_timeout';
    default:
      return 'unknown';
  }
}

// ── Response shapes ────────────────────────────────────────────────────────
// Only the fields the site consumes are declared; the API may return more.

export interface PlanSlot {
  limit: number;
  claimed: number;
  remaining: number;
  soldOut: boolean;
}

export interface Plan {
  code: string;
  period: string;
  name: string;
  priceIdr: number;
  durationDays: number;
  tokenQuota: number | null;
  rpmLimit: number | null;
  maxConcurrent: number | null;
  active: boolean;
  slotLimit?: number;
}

export interface PlansResponse {
  plans: Plan[];
  grouped: Record<string, Plan[]>;
  slots: Record<string, PlanSlot>;
}

export interface ModelModalities {
  input: string[] | null;
  output: string[] | null;
}

export interface ModelPricing {
  prompt?: string | null;
  completion?: string | null;
}

export interface Model {
  id: string;
  prefix: string;
  displayName: string;
  logoUrl?: string;
  description?: string;
  tier: string;
  vendor: string;
  vendorLogo?: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  modalities?: ModelModalities;
  reasoning: boolean | null;
  reasoningEfforts?: string[] | null;
  vision?: boolean | null;
  pricing?: ModelPricing | null;
  enabled: boolean;
}

export interface ModelsResponse {
  models: Model[];
}

export interface ModelInsight {
  model: string;
  rank: number;
  requests: number;
  tokens: number;
  errors: number;
  upstreams?: unknown;
  successRate: number;
}

export interface ModelInsightsResponse {
  date?: string;
  range?: string;
  label?: string;
  since?: string;
  models: ModelInsight[];
}

export type AnnouncementLevel = 'info' | 'success' | 'warning' | 'danger';
export type AnnouncementAudience = 'public' | 'authenticated' | 'plan';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  posterImage?: string;
  posterLink?: string;
  audience: AnnouncementAudience;
  planCodes: string[];
  startsAt?: string;
  endsAt?: string;
  dismissible: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementsResponse {
  items: Announcement[];
}

export interface SaasUser {
  id: string;
  email: string;
  status: string;
  role: string;
  createdAt?: string;
  username?: string;
  hasPassword?: boolean;
  isSupporter?: boolean;
}

export interface Subscription {
  planCode: string;
  period: string;
  status: string;
  activatedAt: string;
  expiresAt: string;
  expiresAtWib: string;
  createdAt: string;
}

export interface DashboardResponse {
  user: SaasUser;
  subscription: Subscription | null;
  plan: Plan | null;
  quota: { used: number; total: number | null; remaining: number | null };
  activeKeys: number;
  wibDayStart: string;
}

export interface UsageDay {
  day: string;
  tokens: number;
  [key: string]: unknown;
}

export interface UsageHistoryResponse {
  days: UsageDay[];
}

export interface ApiKeyRow {
  id: string;
  name?: string;
  keyPrefix?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ApiKeysResponse {
  keys: ApiKeyRow[];
}

export interface CreatedKey {
  id: string;
  key: string;
  keyPrefix: string;
  plan: string;
}

export interface LoginResponse {
  token: string;
  user: SaasUser;
}

export interface MeResponse {
  user: SaasUser;
  subscription: Subscription | null;
  plan: Plan | null;
}

export interface RegisterResponse {
  ok: boolean;
  freeSubscription: { expiresAt: string } | null;
}

export interface RequestOptions {
  /** Bearer session token, for authenticated calls. */
  token?: string;
  /** HTTP method; defaults to GET. */
  method?: string;
  /** JSON request body. */
  body?: unknown;
  /** AbortSignal to compose with the client timeout. */
  signal?: AbortSignal;
}

export interface ApiClient {
  getPlans(): Promise<PlansResponse>;
  getModels(): Promise<ModelsResponse>;
  getModelInsights(range?: string): Promise<ModelInsightsResponse>;
  getAnnouncements(token?: string): Promise<AnnouncementsResponse>;
  login(email: string, password: string): Promise<LoginResponse>;
  register(email: string, password: string, turnstileToken?: string): Promise<RegisterResponse>;
  getMe(token: string): Promise<MeResponse>;
  getDashboard(token: string): Promise<DashboardResponse>;
  getUsageHistory(token: string): Promise<UsageHistoryResponse>;
  listKeys(token: string): Promise<ApiKeysResponse>;
  createKey(token: string, name?: string): Promise<CreatedKey>;
  deleteKey(token: string, id: string): Promise<{ ok: boolean }>;
}

/**
 * Create the shared API client.
 *
 * Every call is bounded by `timeoutMs` and mapped onto `ApiErrorKind`, so a
 * page can distinguish "model does not exist" from "the API is unreachable"
 * without parsing upstream text.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;

    // Compose the caller signal (if any) with our own timeout so either can
    // abort the request without one clobbering the other.
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
    const signal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal;

    let res: Response;
    try {
      res = await fetch(base + path, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ApiClientError('dependency_timeout', 0, 'Permintaan ke API melebihi batas waktu.');
      }
      throw new ApiClientError('unknown', 0, 'Tidak bisa menghubungi API.');
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      let message = `Permintaan gagal (${res.status}).`;
      const e = (parsed as { error?: { message?: string } } | null)?.error;
      if (e?.message) message = e.message;
      throw new ApiClientError(kindForStatus(res.status), res.status, message);
    }
    return parsed as T;
  }

  return {
    getPlans: () => request<PlansResponse>('/saas/api/plans'),
    getModels: () => request<ModelsResponse>('/saas/api/models'),
    getModelInsights: (range) =>
      request<ModelInsightsResponse>(
        range ? `/saas/api/models/insights?range=${encodeURIComponent(range)}` : '/saas/api/models/insights',
      ),
    getAnnouncements: (token) => request<AnnouncementsResponse>('/saas/api/announcements', { token }),
    login: (email, password) =>
      request<LoginResponse>('/saas/api/login', { method: 'POST', body: { email, password } }),
    register: (email, password, turnstileToken) =>
      request<RegisterResponse>('/saas/api/register', {
        method: 'POST',
        body: { email, password, ...(turnstileToken ? { turnstileToken } : {}) },
      }),
    getMe: (token) => request<MeResponse>('/saas/api/me', { token }),
    getDashboard: (token) => request<DashboardResponse>('/saas/api/dashboard', { token }),
    getUsageHistory: (token) => request<UsageHistoryResponse>('/saas/api/usage-history', { token }),
    listKeys: (token) => request<ApiKeysResponse>('/saas/api/keys', { token }),
    createKey: (token, name) =>
      request<CreatedKey>('/saas/api/keys', { method: 'POST', token, body: { name: name ?? 'default' } }),
    deleteKey: (token, id) =>
      request<{ ok: boolean }>(`/saas/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  };
}

/** Resolve the configured API base, falling back to the loopback gateway. */
export function resolveApiBase(env: Record<string, string | undefined>): string {
  const configured = env.API_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'http://127.0.0.1:12801';
}

/** Build a client from the current server environment. */
export function apiClientFromEnv(env: Record<string, string | undefined>): ApiClient {
  return createApiClient({ baseUrl: resolveApiBase(env), timeoutMs: 15_000 });
}

export { ApiClientError };
