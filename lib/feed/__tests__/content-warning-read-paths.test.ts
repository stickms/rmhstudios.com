/**
 * Content warnings (sprint 06 #16), FR-5: every server file that returns a post's text to someone other than its author
 * carries the reason. A source scan, like QUIET_COUNT_READ_PATHS and GIF_ALT_READ_PATHS: the registry names the files,
 * the scan holds them to it, and a new read of a post's text has to be listed or exempted with a reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_WARNING_EXEMPT_PATHS, CONTENT_WARNING_READ_PATHS } from '@/lib/feed/content-warning';

const ROOT = join(__dirname, '..', '..', '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const abs = join(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(relative(ROOT, abs));
    }
  }
  return out;
}

describe('CONTENT_WARNING_READ_PATHS', () => {
  it('lists real files with no duplicates', () => {
    expect(new Set(CONTENT_WARNING_READ_PATHS).size).toBe(CONTENT_WARNING_READ_PATHS.length);
    for (const path of CONTENT_WARNING_READ_PATHS) {
      expect(() => read(path), path).not.toThrow();
    }
  });

  it.each([...CONTENT_WARNING_READ_PATHS])('%s carries contentWarning', (path) => {
    expect(read(path), `${path} must read and carry contentWarning`).toContain('contentWarning');
  });

  it('is never exempt as well', () => {
    for (const path of CONTENT_WARNING_READ_PATHS) {
      expect(CONTENT_WARNING_EXEMPT_PATHS, path).not.toHaveProperty([path]);
    }
  });

  it('covers at least the surfaces the specification names', () => {
    const joined = CONTENT_WARNING_READ_PATHS.join('\n');
    for (const needle of [
      'map-feed-item', // the feed
      'postid', // the post page
      'profile.$id.rmharks', // profile
      'search/posts', // search
      'embed.post', // embeds
      'rss.server', // RSS
      'engagement.server', // notification previews
      'og.post', // OG
      'api/v1/', // the developer API
    ]) {
      expect(joined, needle).toContain(needle);
    }
  });
});

describe('every read of a post’s text under lib/ and app/routes/', () => {
  const files = [...walk('lib'), ...walk('app/routes')].filter((f) => {
    const src = read(f);
    return /rMHark\.(findMany|findUnique|findFirst)/.test(src) && /content: true|content: \{ not/.test(src);
  });

  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('carries the reason, or is exempt with a reason', () => {
    const unaccounted = files.filter(
      (f) =>
        !read(f).includes('contentWarning') &&
        !(f in CONTENT_WARNING_EXEMPT_PATHS) &&
        !CONTENT_WARNING_READ_PATHS.includes(f),
    );
    expect(
      unaccounted,
      'a file reads a post’s text without contentWarning: list it or exempt it with a reason',
    ).toEqual([]);
  });

  it('keeps the exempt list honest: real files that still read post text, each with a reason', () => {
    for (const [path, reason] of Object.entries(CONTENT_WARNING_EXEMPT_PATHS)) {
      expect(reason.length, path).toBeGreaterThan(10);
      const src = read(path);
      expect(/rMHark\./.test(src) && /content/.test(src), `${path} no longer reads post text: drop it`).toBe(true);
    }
  });
});

describe('the surfaces', () => {
  it('post queries that select columns select contentWarning wherever they select isSensitive', () => {
    for (const path of CONTENT_WARNING_READ_PATHS) {
      const src = read(path);
      if (/isSensitive:\s*true/.test(src)) {
        expect(/contentWarning:\s*true/.test(src), `${path} selects isSensitive but not contentWarning`).toBe(true);
      }
    }
  });

  it('the feed mappers return the reason beside the flag', () => {
    expect(read('lib/feed/map-feed-item.server.ts')).toMatch(
      /isSensitive: r\.isSensitive \?\? false,\s*contentWarning: r\.contentWarning \?\? undefined/,
    );
    expect(read('lib/feed/timeline.ts')).toMatch(/contentWarning: isDeleted \? undefined/);
    expect(read('lib/profile/api/profile.$id.rmharks.server.ts')).toMatch(
      /contentWarning: r\.contentWarning \?\? undefined/,
    );
  });

  it('a cached feed page is re-read for the warning, so a post warned after it was cached is covered at once', () => {
    const src = read('lib/feed/page-reconcile.server.ts');
    expect(src).toContain('contentWarning: true');
    expect(src).toMatch(/isSensitive: row\.isSensitive,\s*contentWarning: row\.contentWarning/);
  });

  it('the registry source scan sees nothing outside the repository’s own files', () => {
    for (const path of Object.keys(CONTENT_WARNING_EXEMPT_PATHS)) {
      expect(path.startsWith('lib/') || path.startsWith('app/routes/'), path).toBe(true);
    }
  });
});

describe('quote cards', () => {
  it('carry the quoted original’s warning, and the card covers it', () => {
    expect(read('lib/feed/quoted-original.ts')).toMatch(/contentWarning: o\.contentWarning \?\? undefined/);
    expect(read('lib/feed/page-reconcile.server.ts')).toMatch(/contentWarning: q\.contentWarning/);
    const card = read('components/feed/RMHarkCard.tsx');
    expect(card).toMatch(/contentWarning: item\.original\.contentWarning/);
    expect(card).toMatch(/<SensitiveMedia sensitive=\{item\.original\.isSensitive\}/);
  });
});
