// SEO helpers: canonical/meta/OpenGraph/Twitter plus JSON-LD builders.
//
// One source for every page so titles, descriptions, and structured data stay
// consistent and unique.

export const SITE_NAME = 'bansosAI';
export const SITE_URL = 'https://bansosai.app';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/bansosai-touch.png`;

export interface MetaInput {
  title: string;
  description: string;
  /** Path (e.g. "/models") or absolute URL. */
  canonical: string;
  ogImage?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
}

export interface MetaResult {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: string;
  noindex: boolean;
}

/** Turn a site-relative path into an absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${path}`;
}

/** Normalize meta inputs; the title is suffixed with the brand name. */
export function buildMeta(input: MetaInput): MetaResult {
  const titled = input.title.includes(SITE_NAME) ? input.title : `${input.title} — ${SITE_NAME}`;
  return {
    title: titled,
    description: input.description,
    canonical: absoluteUrl(input.canonical),
    ogImage: absoluteUrl(input.ogImage ?? DEFAULT_OG_IMAGE),
    ogType: input.type ?? 'website',
    noindex: input.noindex ?? false,
  };
}

/** JSON-LD: Organization + WebSite (with the model-catalog search action). */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/bansosai-touch.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: 'id',
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/models?q={query}`,
          'query-input': 'required name=query',
        },
      },
    ],
  };
}

/** JSON-LD: SoftwareApplication for a model detail page. */
export function modelJsonLd(input: {
  name: string;
  description: string;
  slug: string;
  vendor: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/models/${input.slug}`,
    author: { '@type': 'Organization', name: input.vendor || SITE_NAME },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
  };
}

/** JSON-LD: BreadcrumbList. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** JSON-LD: FAQPage from question/answer pairs. */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}
