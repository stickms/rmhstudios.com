/**
 * Universal search — the long-form corpora: blog posts, news articles, user
 * builds and library documents.
 *
 * These were previously reachable only through Prisma `contains`, i.e. a
 * leading-wildcard `ILIKE '%q%'` over title and description. That is
 * unindexable, ignores the body entirely, and has zero typo tolerance: one
 * transposed letter and the article simply did not exist. They now use the same
 * two-stage recall/precision shape as people and posts.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { fuzzyAny, type FuzzyTerms } from './db.server';
import { confidenceOf, scoreRecord, withPopularity, withRecency, MATCH_FLOOR } from './score';
import type { SearchHit, SearchKind } from './types';

const CANDIDATE_POOL = 60;
/**
 * Bodies are truncated before they leave Postgres. Scoring a 40 KB article body
 * in JS buys nothing — anything relevant that deep is better served by the
 * title/description signals — and it would dominate the request's CPU budget.
 */
const BODY_SCAN_CHARS = 4000;
const SNIPPET_CHARS = 240;

const WEIGHTS = {
  title: 1,
  description: 0.65,
  tags: 0.6,
  category: 0.5,
  body: 0.4,
} as const;

interface DocRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string | null;
  tags: string[] | null;
  category: string | null;
  image: string | null;
  popularity: number | null;
  created_at: Date | null;
}

interface DocCorpus {
  kind: SearchKind;
  href: (slug: string) => string;
  query: (terms: FuzzyTerms) => Prisma.Sql;
}

const BLOG: DocCorpus = {
  kind: 'blog',
  href: (slug) => `/blog/${slug}`,
  query: (terms) => Prisma.sql`
    SELECT id, slug, title, description,
           left("content", ${BODY_SCAN_CHARS}) AS body,
           tags,
           NULL::text AS category,
           image,
           0 AS popularity,
           "createdAt" AS created_at
    FROM "blog_post"
    WHERE ${fuzzyAny(
      [
        Prisma.sql`title`,
        Prisma.sql`description`,
        Prisma.sql`array_to_string(tags, ' ')`,
        Prisma.sql`left("content", ${BODY_SCAN_CHARS})`,
      ],
      terms,
      { perToken: true },
    )}
    LIMIT ${CANDIDATE_POOL}
  `,
};

const NEWS: DocCorpus = {
  kind: 'news',
  href: (slug) => `/news/${slug}`,
  query: (terms) => Prisma.sql`
    SELECT id, slug, title, description,
           left("content", ${BODY_SCAN_CHARS}) AS body,
           tags,
           category,
           image,
           0 AS popularity,
           "createdAt" AS created_at
    FROM "news_article"
    WHERE status = 'PUBLISHED'
      AND ${fuzzyAny(
        [
          Prisma.sql`title`,
          Prisma.sql`description`,
          Prisma.sql`category`,
          Prisma.sql`array_to_string(tags, ' ')`,
          Prisma.sql`left("content", ${BODY_SCAN_CHARS})`,
        ],
        terms,
        { perToken: true },
      )}
    LIMIT ${CANDIDATE_POOL}
  `,
};

const BUILDS: DocCorpus = {
  kind: 'build',
  href: (slug) => `/user-builds/${slug}`,
  query: (terms) => Prisma.sql`
    SELECT id, slug, title, description,
           left(COALESCE("readme", ''), ${BODY_SCAN_CHARS}) AS body,
           NULL::text[] AS tags,
           NULL::text AS category,
           "thumbnailUrl" AS image,
           "likeCount" AS popularity,
           "publishedAt" AS created_at
    FROM "user_build"
    WHERE visibility = 'PUBLIC'
      AND ${fuzzyAny(
        [
          Prisma.sql`title`,
          Prisma.sql`description`,
          Prisma.sql`left(COALESCE("readme", ''), ${BODY_SCAN_CHARS})`,
        ],
        terms,
        { perToken: true },
      )}
    LIMIT ${CANDIDATE_POOL}
  `,
};

const LIBRARY: DocCorpus = {
  kind: 'library',
  href: (slug) => `/library/${slug}`,
  query: (terms) => Prisma.sql`
    SELECT id, slug, title, description,
           NULL::text AS body,
           NULL::text[] AS tags,
           NULL::text AS category,
           NULL::text AS image,
           0 AS popularity,
           "createdAt" AS created_at
    FROM "library_document"
    WHERE hidden = false
      AND ${fuzzyAny([Prisma.sql`title`, Prisma.sql`description`], terms, { perToken: true })}
    LIMIT ${CANDIDATE_POOL}
  `,
};

const CORPORA: Record<'blog' | 'news' | 'build' | 'library', DocCorpus> = {
  blog: BLOG,
  news: NEWS,
  build: BUILDS,
  library: LIBRARY,
};

export type DocCorpusName = keyof typeof CORPORA;

export interface DocSearchOptions {
  limit?: number;
  floor?: number;
}

/** Rank one long-form corpus for `terms`. */
export async function searchDocs(
  corpus: DocCorpusName,
  terms: FuzzyTerms,
  opts: DocSearchOptions = {},
): Promise<SearchHit[]> {
  if (!terms.q) return [];
  const limit = opts.limit ?? 8;
  const floor = opts.floor ?? MATCH_FLOOR;
  const def = CORPORA[corpus];

  const rows = await prisma.$queryRaw<DocRow[]>(def.query(terms));
  if (rows.length === 0) return [];

  const hits = rows
    .map((row): SearchHit | null => {
      const tags = Array.isArray(row.tags) ? row.tags.join(' ') : null;
      const { score, reason } = scoreRecord(terms.q, [
        { value: row.title, weight: WEIGHTS.title },
        { value: row.description, weight: WEIGHTS.description },
        { value: tags, weight: WEIGHTS.tags },
        { value: row.category, weight: WEIGHTS.category },
        { value: row.body, weight: WEIGHTS.body },
      ]);
      if (score < floor) return null;
      const boosted = withRecency(withPopularity(score, row.popularity ?? 0), row.created_at);
      const snippet = (row.description || row.body || '').slice(0, SNIPPET_CHARS);
      return {
        key: `${def.kind}:${row.id}`,
        id: row.slug,
        kind: def.kind,
        title: row.title,
        subtitle: row.category ?? undefined,
        snippet: snippet || undefined,
        href: def.href(row.slug),
        image: row.image,
        score: boosted,
        confidence: confidenceOf(boosted),
        reason,
      };
    })
    .filter((h): h is SearchHit => h !== null);

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
