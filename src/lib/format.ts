// Formatting helpers (id-ID). Kept dependency-free so they can run in SSR and
// in the browser (the filter bar reuses the same number formatting).

/** Format an integer with Indonesian thousand separators. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID').format(value);
}

/** Format an Rupiah amount. `0` renders as "Gratis". */
export function formatIdr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return 'Gratis';
  return `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
}

/** Compact token/context formatting: 1_000_000 -> "1M", 200_000 -> "200K". */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(0)}K`;
  }
  return String(value);
}

/** Large-token compaction for ranking totals: 1.95B, 53.3M, 188.1K. */
export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** Percentage with one decimal, e.g. 99.78 -> "99,8%". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value)}%`;
}

/** Format an ISO timestamp as a WIB (UTC+7) date-time for display. */
export function formatWib(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/** Render the periodic price label used on pricing cards. */
export function periodLabel(period: string): string {
  switch (period) {
    case 'daily':
      return 'per hari';
    case 'weekly':
      return 'per minggu';
    case 'monthly':
      return 'per bulan';
    default:
      return `per ${period}`;
  }
}

/** A short human label for a plan's quota. */
export function quotaLabel(tokenQuota: number | null): string {
  if (tokenQuota === null || tokenQuota === undefined) return 'Token unlimited';
  return `${formatNumber(tokenQuota)} token`;
}
