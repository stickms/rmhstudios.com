/**
 * WS1 (server perf 2026-10-21): the /news index loader ships list fields only.
 *
 * The list reads title/date/description/category/tags/source* and the hero reads
 * the featured subset of the same rows. The article body (`content`) is several
 * KB per article and was being serialized into the document HTML for every
 * article — and again for the featured ones. This pins the select so the body
 * cannot slip back into the index payload, and pins that the featured list is
 * derived from the first query rather than a second round trip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The select and the query now live in the shared news helper (replica read);
// the route only calls it. See news-index-route.test.ts for the route itself.
const src = readFileSync(join(process.cwd(), 'lib/news.ts'), 'utf8');
const select = src.match(/const NEWS_INDEX_SELECT = \{([\s\S]*?)\} as const;/)?.[1] ?? '';
const index = src.slice(src.indexOf('export async function getNewsIndexArticles'));

describe('/news index loader', () => {
  it('selects the fields the list components read', () => {
    for (const field of [
      'slug',
      'title',
      'date',
      'description',
      'category',
      'tags',
      'featured',
      'sourcePublisher',
      'sourceUrl',
    ]) {
      expect(select, field).toMatch(new RegExp(`\\b${field}: true`));
    }
  });

  it('does not select the article body or other unused columns', () => {
    for (const field of ['content', 'image', 'sourceTitle', 'discordMessageId', 'status']) {
      expect(select, field).not.toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it('keeps the published filter and date-desc order', () => {
    expect(index).toMatch(/where: \{ status: "PUBLISHED" \}/);
    expect(index).toMatch(/orderBy: \{ date: "desc" \}/);
  });

  it('derives the featured list from the same query', () => {
    const route = readFileSync(join(process.cwd(), 'app/routes/_site/news/index.tsx'), 'utf8');
    expect(route).toMatch(/featured: articles\.filter\(\(a\) => a\.featured\)/);
    expect(route).not.toMatch(/findMany/);
  });
});

describe('news list components only read selected fields', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'components/news', f), 'utf8');
  const used = new Set<string>();
  for (const f of ['NewsList.tsx', 'NewsCard.tsx', 'NewsHero.tsx', 'NewsSourceBadge.tsx']) {
    for (const m of read(f).matchAll(/\b(?:article|a|f)\.(\w+)/g)) used.add(m[1]);
  }

  it('never reads content/image/id from a list row', () => {
    for (const field of ['content', 'image', 'id']) expect([...used]).not.toContain(field);
  });
});
