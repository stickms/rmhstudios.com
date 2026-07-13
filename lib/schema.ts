/**
 * JSON-LD (schema.org) builders for route `head()` functions.
 *
 * Each builder returns a plain object; `jsonLdScript()` wraps one (or an array)
 * into the `{ type, children }` script descriptor TanStack renders as
 * `<script type="application/ld+json">…</script>`. The serialized JSON has `<`
 * escaped so a value can never break out of the script element.
 *
 * Usage in a route head():
 *   head: ({ loaderData, params }) => ({
 *     scripts: [jsonLdScript(articleSchema({ ... }))],
 *     links: [buildCanonical(`/blog/${params.slug}`)],
 *   })
 */

import { SITE_URL } from '@/lib/seo';

const ORG_NAME = 'RMH Studios';
const LOGO_URL = `${SITE_URL}/favicon.svg`;
const DEFAULT_IMAGE = `${SITE_URL}/images/og/default.png`;

type Json = Record<string, unknown>;

/** Wrap one or more schema objects into a head() script descriptor. */
export function jsonLdScript(schema: Json | Json[]) {
  const json = JSON.stringify(schema);
  return {
    type: 'application/ld+json',
    // Escape `<` so a string value can't terminate the <script> element.
    children: json.replace(/</g, '\\u003c'),
  };
}

/** Site-wide publisher identity. Safe on every page. */
export function organizationSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_NAME,
    url: SITE_URL,
    logo: LOGO_URL,
    description:
      'RMH Studios — games, apps, a blog, and a social home for builders. The everything platform.',
  };
}

/** WebSite node with a SearchAction so Google can show a sitelinks search box. */
export function websiteSchema(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ORG_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

interface ArticleInput {
  title: string;
  description?: string;
  /** Human or ISO date string; emitted as-is when present. */
  datePublished?: string;
  /** Absolute or site-relative path, e.g. `/blog/my-post`. */
  path: string;
  image?: string;
  /** schema.org type — 'BlogPosting' | 'NewsArticle' | 'Article'. */
  type?: 'BlogPosting' | 'NewsArticle' | 'Article';
  /** e.g. a news category. */
  section?: string;
}

export function articleSchema({
  title,
  description,
  datePublished,
  path,
  image,
  type = 'Article',
  section,
}: ArticleInput): Json {
  const url = path.startsWith('http') ? path : `${SITE_URL}${path}`;
  return {
    '@context': 'https://schema.org',
    '@type': type,
    headline: title,
    ...(description ? { description } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(section ? { articleSection: section } : {}),
    image: image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : DEFAULT_IMAGE,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    author: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      logo: { '@type': 'ImageObject', url: LOGO_URL },
    },
  };
}

interface BookInput {
  name: string;
  description?: string;
  path: string;
  author?: string;
  image?: string;
}

export function bookSchema({ name, description, path, author, image }: BookInput): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name,
    ...(description ? { description } : {}),
    ...(author ? { author: { '@type': 'Person', name: author } } : {}),
    ...(image ? { image: image.startsWith('http') ? image : `${SITE_URL}${image}` } : {}),
    url: path.startsWith('http') ? path : `${SITE_URL}${path}`,
    publisher: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
  };
}

interface PersonInput {
  name: string;
  handle?: string | null;
  description?: string;
  path: string;
  image?: string | null;
}

export function personSchema({ name, handle, description, path, image }: PersonInput): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    ...(handle ? { alternateName: `@${handle}` } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    url: path.startsWith('http') ? path : `${SITE_URL}${path}`,
  };
}

interface Breadcrumb {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: Breadcrumb[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.path.startsWith('http') ? item.path : `${SITE_URL}${item.path}`,
    })),
  };
}

interface JobPostingInput {
  id: string;
  title: string;
  description: string;
  companyName: string;
  path: string;
  sourceUrl?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  city?: string;
  region?: string;
  remote?: boolean;
}

/** A verified, currently active role. Callers must not pass a full scraped description. */
export function jobPostingSchema({
  id,
  title,
  description,
  companyName,
  path,
  sourceUrl,
  datePosted,
  validThrough,
  employmentType,
  city,
  region,
  remote,
}: JobPostingInput): Json {
  const url = path.startsWith('http') ? path : `${SITE_URL}${path}`;
  const hasLocation = Boolean(city || region);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description,
    identifier: { '@type': 'PropertyValue', name: companyName, value: id },
    hiringOrganization: { '@type': 'Organization', name: companyName },
    ...(datePosted ? { datePosted } : {}),
    ...(validThrough ? { validThrough } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(hasLocation
      ? {
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              ...(city ? { addressLocality: city } : {}),
              ...(region ? { addressRegion: region } : {}),
              addressCountry: 'US',
            },
          },
        }
      : {}),
    ...(remote
      ? {
          jobLocationType: 'TELECOMMUTE',
          applicantLocationRequirements: { '@type': 'Country', name: 'United States' },
        }
      : {}),
    url,
    ...(sourceUrl ? { sameAs: sourceUrl } : {}),
    directApply: false,
  };
}
