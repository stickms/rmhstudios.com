/**
 * `definePage` — declare a page's SEO, derive its `head()`.
 *
 * ## What it replaces
 *
 * There are 133 route files under `app/routes/_site/`, and the ones with SEO
 * all repeat the same block:
 *
 * ```ts
 * head: () => ({
 *   meta: buildMeta({ title, description, path }),
 *   links: [buildCanonical(path)],
 *   scripts: [jsonLdScript(…)],
 * }),
 * ```
 *
 * Three things go wrong in that block, and all three are silent:
 *
 * 1. **The canonical is forgotten.** `buildMeta` does not emit one — it is a
 *    `links` entry — so a route that only calls `buildMeta` looks complete and
 *    indexes under whatever URL the crawler arrived on.
 * 2. **`path` and `buildCanonical(path)` drift.** They are the same string
 *    written twice, so a rename fixes one and leaves the other pointing at a
 *    404. `definePage` takes `path` once and feeds both.
 * 3. **`og:` tags get hand-rolled.** `buildMeta` already owns the whole Open
 *    Graph block (absolute image, declared dimensions, the right
 *    `twitter:card`), so a hand-written `og:image` beside it produces two
 *    conflicting tags — see `lib/seo.ts` for why each of those matters.
 *
 * ## Shape
 *
 * Everything is either a literal or a function of `{ loaderData, params }`, so
 * static pages read as data and dynamic ones stay one-liners:
 *
 * ```ts
 * export const Route = createFileRoute('/_site/quotes')({
 *   head: definePage({
 *     path: '/quotes',
 *     title: 'Steve Jobs Quotes | RMH Studios',
 *     description: 'A collection of the most inspiring Steve Jobs quotes …',
 *   }),
 *   component: QuotesPage,
 * });
 * ```
 *
 * ```ts
 * head: definePage<BlogPost, { slug: string }>({
 *   path: ({ params }) => `/blog/${params.slug}`,
 *   title: ({ loaderData }) => `${loaderData?.title ?? 'Post'} | RMH Studios Devlog`,
 *   description: ({ loaderData }) => loaderData?.description ?? '',
 *   ogCard: ({ params }) => ({ kind: 'blog', id: params.slug }),
 *   jsonLd: ({ loaderData, params }) => (loaderData ? [articleSchema({ … })] : []),
 * }),
 * ```
 *
 * `loaderData` is optional on purpose: TanStack calls `head()` before the
 * loader resolves and again after, so any spec that reads it must tolerate
 * `undefined` — which is the bug this typing makes impossible to miss.
 *
 * Adoption is incremental. Routes that need something this does not model (an
 * RSS `alternate` link, a per-route `robots` tag) keep their hand-written
 * `head()`; nothing here is required.
 */

import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';
import { jsonLdScript } from '@/lib/schema';

/** A JSON-LD node, as the builders in `lib/schema.ts` return it. */
type JsonLd = Record<string, unknown>;

/** The kinds that have a dynamic OG card renderer under `/api/og/<kind>/<id>`. */
export type OgCardKind = Parameters<typeof ogCardPath>[0];

/** What TanStack hands `head()`. Narrowed to the two fields a spec can use. */
export interface PageHeadContext<TLoaderData, TParams> {
  loaderData?: TLoaderData;
  params: TParams;
}

/** A spec field that is either a constant or derived from the head context. */
type Derivable<TValue, TLoaderData, TParams> =
  TValue | ((ctx: PageHeadContext<TLoaderData, TParams>) => TValue);

export interface PageSpec<TLoaderData = unknown, TParams = Record<string, string>> {
  /** Site-relative path. Used for both `og:url` and the canonical link. */
  path: Derivable<string, TLoaderData, TParams>;
  title: Derivable<string, TLoaderData, TParams>;
  description: Derivable<string, TLoaderData, TParams>;
  /**
   * Point at a dynamically rendered card. Mutually exclusive with `image`;
   * return `null` to fall through to the section card `buildMeta` picks.
   */
  ogCard?: (
    ctx: PageHeadContext<TLoaderData, TParams>,
  ) => { kind: OgCardKind; id: string } | null | undefined;
  /** A static image path, when the page has one of its own. */
  image?: Derivable<string | undefined, TLoaderData, TParams>;
  imageAlt?: Derivable<string | undefined, TLoaderData, TParams>;
  /** Pass `null` for art of unknown shape — see `buildMeta`'s `imageSize`. */
  imageSize?: Derivable<{ width: number; height: number } | null | undefined, TLoaderData, TParams>;
  /** `og:type`; `'article'` for posts and news. Defaults to `'website'`. */
  type?: Derivable<string | undefined, TLoaderData, TParams>;
  /** JSON-LD nodes for this page. Emitted through `jsonLdScript` (which escapes `<`). */
  jsonLd?: (ctx: PageHeadContext<TLoaderData, TParams>) => JsonLd[] | JsonLd | null | undefined;
  /**
   * Keep the page out of the index. Still emits the title and canonical: a
   * noindex page is still a browser tab, a bookmark and a screen-reader
   * announcement.
   */
  noIndex?: boolean;
}

function resolve<TValue, TLoaderData, TParams>(
  value: Derivable<TValue, TLoaderData, TParams>,
  ctx: PageHeadContext<TLoaderData, TParams>,
): TValue {
  return typeof value === 'function'
    ? (value as (c: PageHeadContext<TLoaderData, TParams>) => TValue)(ctx)
    : value;
}

/** One entry of the array `buildMeta` produces (`{title}` / `{name,content}` / `{property,content}`). */
type MetaTag = ReturnType<typeof buildMeta>[number];

/** The `head()` return shape TanStack renders. */
export interface PageHead {
  meta: MetaTag[];
  links: ReturnType<typeof buildCanonical>[];
  scripts: ReturnType<typeof jsonLdScript>[];
}

/**
 * Build a route `head()` from a page description.
 *
 * Returns the function itself (not the object), so it drops straight into
 * `createFileRoute(...)({ head: definePage({ … }) })`.
 */
export function definePage<TLoaderData = unknown, TParams = Record<string, string>>(
  spec: PageSpec<TLoaderData, TParams>,
): (ctx: PageHeadContext<TLoaderData, TParams>) => PageHead {
  return (ctx) => {
    const path = resolve(spec.path, ctx);
    const card = spec.ogCard?.(ctx);
    // `ogCard` and `image` cannot both win; the dynamic card is the more
    // specific statement, so it takes precedence when a spec sets both.
    const image = card ? ogCardPath(card.kind, card.id) : resolve(spec.image, ctx);
    const jsonLd = spec.jsonLd?.(ctx);
    const nodes = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

    return {
      meta: [
        ...buildMeta({
          title: resolve(spec.title, ctx),
          description: resolve(spec.description, ctx),
          path,
          image,
          imageAlt: resolve(spec.imageAlt, ctx),
          imageSize: resolve(spec.imageSize, ctx),
          type: resolve(spec.type, ctx) ?? 'website',
        }),
        // `follow` and not `nofollow`: these pages link into the public site and
        // there is no reason to throw that link equity away — only the page
        // itself should stay out of the index.
        ...(spec.noIndex ? [{ name: 'robots', content: 'noindex, follow' }] : []),
      ],
      links: [buildCanonical(path)],
      // One script element for the whole page: multiple JSON-LD blocks are legal
      // but harder to validate, and `jsonLdScript` already accepts an array.
      scripts: nodes.length > 0 ? [jsonLdScript(nodes)] : [],
    };
  };
}
