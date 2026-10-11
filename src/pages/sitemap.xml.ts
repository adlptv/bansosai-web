// GET /sitemap.xml — dynamic sitemap.
//
// Astro SSR renders every page per request, so a build-time sitemap would be
// empty. This endpoint enumerates the public routes and includes each model
// detail page so crawlers discover the whole catalog. Private surfaces
// (/console, /api, /app) are deliberately excluded, matching robots.txt.

import type { APIRoute } from 'astro';
import { getApi } from '../lib/api/server';
import { SITE_URL } from '../lib/seo';

export const prerender = false;

const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/models', changefreq: 'daily', priority: '0.9' },
  { path: '/model-ranking', changefreq: 'daily', priority: '0.8' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.8' },
  { path: '/docs', changefreq: 'weekly', priority: '0.7' },
  { path: '/docs/quickstart', changefreq: 'monthly', priority: '0.6' },
  { path: '/docs/api-reference', changefreq: 'monthly', priority: '0.6' },
  { path: '/docs/models', changefreq: 'monthly', priority: '0.6' },
  { path: '/docs/pricing', changefreq: 'monthly', priority: '0.6' },
  { path: '/docs/faq', changefreq: 'monthly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
];

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);

export const GET: APIRoute = async () => {
  const urls: { loc: string; changefreq: string; priority: string }[] = STATIC_ROUTES.map((r) => ({
    loc: `${SITE_URL}${r.path}`,
    changefreq: r.changefreq,
    priority: r.priority,
  }));

  // Model detail pages. A failed API call must still yield a valid sitemap.
  try {
    const res = await getApi().getModels();
    for (const m of res.models ?? []) {
      urls.push({
        loc: `${SITE_URL}/models/${encodeURIComponent(m.prefix || m.id)}`,
        changefreq: 'weekly',
        priority: '0.6',
      });
    }
  } catch {
    /* static routes only */
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
