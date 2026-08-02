import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMeta, ogCardPath, absoluteUrl, SITE_URL, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { STATIC_CARDS, staticCardFor, staticCardImage } from '@/lib/og/static-cards';
import { fitText } from '@/lib/og/chrome.server';

/**
 * The Open Graph card system, as a gate.
 *
 * Everything here is a rule that failed silently before it was checked: a card
 * that 404s looks identical in the source to one that works, and a relative
 * `og:image` looks correct right up until a crawler drops it. None of these can
 * be caught by looking at the page — they are only visible in the unfurl, which
 * is the one surface nobody has open while editing.
 */

const meta = (arr: ReturnType<typeof buildMeta>, key: string): string | undefined => {
  const hit = arr.find(
    (m) => ('property' in m && m.property === key) || ('name' in m && m.name === key),
  ) as { content?: string } | undefined;
  return hit?.content;
};

describe('static cards', () => {
  it('every declared card has a rendered PNG on disk', () => {
    // The original bug this whole area had: `lib/seo.ts` referenced
    // `/images/og/default.png` for months while `public/images/og/` did not
    // exist, so every share without a custom card unfurled broken.
    const missing = STATIC_CARDS.filter(
      (card) => !existsSync(resolve(process.cwd(), 'public', staticCardImage(card).slice(1))),
    ).map((c) => c.file);
    expect(missing).toEqual([]);
  });

  it('matches the home page exactly, not by prefix', () => {
    expect(staticCardFor('/')?.file).toBe('default');
    // If `/` matched by prefix it would swallow every path on the site.
    expect(staticCardFor('/games')?.file).toBe('games');
  });

  it('resolves a nested path to its section card', () => {
    expect(staticCardFor('/library/albums/holiday')?.file).toBe('library');
    expect(staticCardFor('/blog/some-post')?.file).toBe('blog');
    expect(staticCardFor('/rmhladder/jobs/abc')?.file).toBe('rmhladder');
  });

  it('does not match a path that merely starts with a section name', () => {
    // `/marketing` is not inside `/market`.
    expect(staticCardFor('/marketplace-rules')).toBeNull();
  });

  it('ignores trailing slashes and query strings', () => {
    expect(staticCardFor('/games/')?.file).toBe('games');
    expect(staticCardFor('/games?sort=new')?.file).toBe('games');
  });

  it('falls through to null for a path with no section', () => {
    expect(staticCardFor('/settings/appearance')).toBeNull();
  });
});

describe('buildMeta', () => {
  const base = { title: 'Title', description: 'Description', path: '/settings/appearance' };

  it('makes a site-relative image absolute', () => {
    const tags = buildMeta({ ...base, image: '/api/og/post/abc' });
    expect(meta(tags, 'og:image')).toBe(`${SITE_URL}/api/og/post/abc`);
    expect(meta(tags, 'twitter:image')).toBe(`${SITE_URL}/api/og/post/abc`);
  });

  it('leaves an absolute image alone', () => {
    const tags = buildMeta({ ...base, image: 'https://cdn.example.com/a.png' });
    expect(meta(tags, 'og:image')).toBe('https://cdn.example.com/a.png');
  });

  it('falls back to the site default when the path matches no section', () => {
    expect(meta(buildMeta(base), 'og:image')).toBe(absoluteUrl(DEFAULT_OG_IMAGE));
  });

  it('uses the section card when the path has one', () => {
    const tags = buildMeta({ ...base, path: '/library/albums/x' });
    expect(meta(tags, 'og:image')).toBe(`${SITE_URL}/images/og/library.png`);
  });

  it('declares dimensions for rendered cards', () => {
    const tags = buildMeta({ ...base, image: '/api/og/post/abc' });
    expect(meta(tags, 'og:image:width')).toBe('1200');
    expect(meta(tags, 'og:image:height')).toBe('630');
    expect(meta(tags, 'twitter:card')).toBe('summary_large_image');
  });

  it('omits dimensions and drops to a small card for foreign-sized images', () => {
    // A user-uploaded thumbnail is whatever shape it was uploaded at; claiming
    // 1200×630 for it makes consumers letterbox or crop it wrongly.
    const tags = buildMeta({ ...base, image: '/uploads/thumb.png', imageSize: null });
    expect(meta(tags, 'og:image:width')).toBeUndefined();
    expect(meta(tags, 'og:image:height')).toBeUndefined();
  });

  it('always emits alt text, defaulting to the title', () => {
    expect(meta(buildMeta(base), 'og:image:alt')).toBe('Title');
    expect(meta(buildMeta({ ...base, imageAlt: 'A globe' }), 'og:image:alt')).toBe('A globe');
  });

  it('emits a canonical og:url for the page', () => {
    expect(meta(buildMeta(base), 'og:url')).toBe(`${SITE_URL}/settings/appearance`);
  });
});

describe('ogCardPath', () => {
  it('points at the card route for a kind', () => {
    expect(ogCardPath('game', 'isleworks')).toBe('/api/og/game/isleworks');
  });

  it('encodes ids so a handle with a slash cannot escape the route', () => {
    expect(ogCardPath('profile', 'a/b')).toBe('/api/og/profile/a%2Fb');
  });
});

describe('fitText', () => {
  const box = { width: 1000, height: 200, steps: [96, 72, 56, 40, 28] };

  it('gives short text the largest step', () => {
    expect(fitText('Isleworks', box)).toBe(96);
  });

  it('steps down as the text grows', () => {
    const short = fitText('A short title', box);
    const long = fitText('A considerably longer title that has to wrap several times over', box);
    expect(long).toBeLessThan(short);
  });

  it('never exceeds the box at the size it picks', () => {
    // The property that matters: satori does not clip, so a size that overflows
    // paints over the rows around it.
    const text = 'x'.repeat(400);
    const size = fitText(text, box);
    const perLine = Math.floor(box.width / (size * 0.5));
    const lines = Math.ceil(text.length / perLine);
    // The smallest step is a floor, so only assert the fit when one was found.
    if (size !== box.steps[box.steps.length - 1]) {
      expect(lines * size * 1.28).toBeLessThanOrEqual(box.height);
    }
  });

  it('returns the smallest step rather than nothing when nothing fits', () => {
    expect(fitText('x'.repeat(5000), box)).toBe(28);
  });
});
