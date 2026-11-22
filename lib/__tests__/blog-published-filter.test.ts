/**
 * Every public reader of a Log goes through `publishedLogWhere` (s03-05).
 *
 * A draft or scheduled Log must be invisible everywhere the public can look: the page, RSS, the sitemap, search,
 * the digest, the sidebar, the developer API, OG cards, takeaways, highlights, comments, announcements and the
 * subscription fan-out. One helper is the only way to say "live", and this gate fails any `prisma.blogPost` read
 * outside the admin module and the publication modules that does not use it, so a reader added next year cannot
 * quietly publish a draft.
 */
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

/** The only files that may read a Log without the filter: they exist to see drafts. */
const ALLOWED = new Set([
  'lib/admin/api/admin.blog.server.ts',
  // s05-10 admin lookup: `auth: 'admin'`, resolves a pasted /blog/<slug> to the Log and says when it is a draft.
  'lib/admin/lookup.server.ts',
  'lib/blog/publication.ts',
  'lib/blog/publication.server.ts',
]);

/** Readers that must use the filter, named so that deleting one of them from the list is a visible decision. */
const READERS = [
  'lib/blog.ts',
  'lib/sitemap.server.ts',
  'lib/search/indexer.server.ts',
  'lib/digest/assemble.server.ts',
  'lib/sidebar-data.ts',
  'lib/sitewide-announcement.server.ts',
  'lib/api/routes/sitewide-announcement.seen.server.ts',
  'app/routes/api/v1/blog.ts',
  'app/routes/api/v1/blog/$slug.ts',
  'lib/og/api/og.blog.$slug.server.ts',
  'lib/ai/api/ai.takeaways.server.ts',
  'lib/reading/highlights.server.ts',
  // s07-18: the titles in a member's reading-time summary.
  'lib/reading/time-record.server.ts',
  'lib/blog/blog-comments.server.ts',
  'lib/reading/subscriptions.server.ts',
];

// `prisma.blogPost.findMany(`, `db.blogPost\n  .findFirst(`, `.count(`… on any client name.
const READ = /\b(?:prisma|prismaRead|db|tx)\s*\.\s*blogPost\s*\.\s*(?:find\w*|count|aggregate|groupBy)\s*\(/g;

/** The text of the call: from its opening parenthesis to the matching close. */
function callBody(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

function sources(): string[] {
  return globSync('{app,lib,server,components,features}/**/*.{ts,tsx}', {
    cwd: ROOT,
    exclude: (p) => /node_modules|__tests__|\.cache|\.test\./.test(p),
  });
}

describe('Log readers use publishedLogWhere', () => {
  it('no prisma.blogPost read outside the admin and publication modules lacks the filter', () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      if (ALLOWED.has(file)) continue;
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      for (const m of src.matchAll(READ)) {
        const body = callBody(src, m.index + m[0].length - 1);
        if (!body.includes('publishedLogWhere')) {
          offenders.push(`${file}: ${m[0].replace(/\s+/g, '')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every reader of the list still reads Logs, and through the helper', () => {
    for (const file of READERS) {
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      expect(src, file).toContain('publishedLogWhere');
    }
  });

  it('raw SQL over blog_post (search) names the status and publication date', () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      if (!/FROM\s+"blog_post"|table:\s*'blog_post'/.test(src)) continue;
      if (!/status = 'published' AND "publishedAt" <= now\(\)/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the gate sees the reads it is meant to police', () => {
    const files = sources().filter((f) => {
      const src = readFileSync(resolve(ROOT, f), 'utf8');
      return new RegExp(READ.source).test(src);
    });
    expect(files).toContain('lib/blog.ts');
    expect(files.length).toBeGreaterThanOrEqual(READERS.length);
  });
});

describe('Log reads that return drafts are guarded where they run', () => {
  // A `createServerFn` is its own HTTP endpoint: the admin layout's `beforeLoad` does not run before a direct call,
  // so a server function that returns drafts must check the admin flag itself.
  it.each(['app/routes/_site/admin/blog/index.tsx', 'app/routes/_site/admin/blog/$slug/edit.tsx'])(
    '%s checks the admin flag inside its server function',
    (file) => {
      const src = readFileSync(resolve(ROOT, file), 'utf8');
      const handler = src.slice(src.indexOf('createServerFn'));
      expect(handler.slice(0, handler.indexOf('createFileRoute'))).toMatch(
        /requireAdminServerFn\(\)|getRequestSession\(\)[\s\S]*isAdmin/,
      );
    },
  );

  it('the caches a public Log read sits in are all dropped by invalidateLogCaches', () => {
    const owners: [string, string][] = [
      ['lib/sidebar-data.ts', 'sidebar:blogPosts'],
      ['app/routes/blog.rss[.]xml.ts', 'blog:rss'],
      ['lib/feed/timeline.ts', 'feed:announcements:'],
    ];
    const publication = readFileSync(resolve(ROOT, 'lib/blog/publication.server.ts'), 'utf8');
    for (const [file, key] of owners) {
      expect(readFileSync(resolve(ROOT, file), 'utf8'), file).toContain(key);
      expect(publication, key).toContain(`'${key}'`);
    }
  });
});
