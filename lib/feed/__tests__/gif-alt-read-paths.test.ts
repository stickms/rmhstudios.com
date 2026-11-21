/**
 * GIF descriptions (sprint 06 #15), FR-6: every server file that returns a `gifUrl` returns `gifAlt` with it. A source
 * scan, like QUIET_COUNT_READ_PATHS and FOLLOW_LIST_READ_PATHS: the registry names the files, the scan holds them to
 * it, and a new `gifUrl` read has to be listed or exempted with a reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GIF_ALT_EXEMPT_PATHS, GIF_ALT_READ_PATHS } from '@/lib/feed/gif-alt';

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

describe('GIF_ALT_READ_PATHS', () => {
  it('lists real files with no duplicates', () => {
    expect(new Set(GIF_ALT_READ_PATHS).size).toBe(GIF_ALT_READ_PATHS.length);
    for (const path of GIF_ALT_READ_PATHS) {
      expect(() => read(path), path).not.toThrow();
    }
  });

  it.each([...GIF_ALT_READ_PATHS])('%s returns gifAlt', (path) => {
    expect(read(path), `${path} must read and return gifAlt`).toContain('gifAlt');
  });

  it('is never exempt as well', () => {
    for (const path of GIF_ALT_READ_PATHS) {
      expect(GIF_ALT_EXEMPT_PATHS, path).not.toHaveProperty([path]);
    }
  });
});

describe('every gifUrl read under lib/ and app/routes/', () => {
  const files = [...walk('lib'), ...walk('app/routes')].filter((f) => read(f).includes('gifUrl'));

  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('returns gifAlt with it, or is exempt with a reason', () => {
    const unaccounted = files.filter(
      (f) => !read(f).includes('gifAlt') && !(f in GIF_ALT_EXEMPT_PATHS),
    );
    expect(unaccounted, 'a file reads gifUrl without gifAlt: list it or exempt it with a reason').toEqual([]);
  });

  it('keeps the exempt list honest: real files that still mention gifUrl, each with a reason', () => {
    for (const [path, reason] of Object.entries(GIF_ALT_EXEMPT_PATHS)) {
      expect(reason.length, path).toBeGreaterThan(10);
      expect(read(path), `${path} no longer mentions gifUrl: drop it from the exempt list`).toContain('gifUrl');
    }
  });
});

describe('the surfaces', () => {
  it('the post queries that select columns select gifAlt wherever they select gifUrl', () => {
    for (const path of GIF_ALT_READ_PATHS) {
      const src = read(path);
      const selectsUrl = /gifUrl:\s*true/.test(src);
      if (selectsUrl) expect(/gifAlt:\s*true/.test(src), `${path} selects gifUrl but not gifAlt`).toBe(true);
    }
  });

  it('the developer API serializer returns gifAlt next to gifUrl, additively', () => {
    const src = read('lib/api/serializers.server.ts');
    expect(src).toMatch(/gifUrl: p\.gifUrl \?\? null/);
    expect(src).toMatch(/gifAlt: p\.gifAlt \?\? null/);
    expect(src).toContain('imageAlts: p.imageAlts');
  });

  it('describe-after-posting reads the GIF and its description', () => {
    const src = read('lib/feed/alt-text-edit.server.ts');
    expect(src).toContain('gifUrl: true');
    expect(src).toContain('gifAlt: true');
  });

  it('a cached feed page is re-read for the GIF description, like the image descriptions', () => {
    expect(read('lib/feed/page-reconcile.server.ts')).toContain('gifAlt: true');
  });

  it('locked and withheld cards drop the GIF description with the GIF', () => {
    expect(read('lib/feed/map-feed-item.server.ts')).toMatch(/gifUrl: undefined,\s*gifAlt: undefined/);
    expect(read('lib/feed/quoted-original.ts')).toMatch(/gifUrl:\s*undefined,\s*gifAlt:\s*undefined/);
    expect(read('lib/feed/api/rmharks.server.ts')).toMatch(/gifUrl: undefined,\s*gifAlt: undefined/);
  });
});
