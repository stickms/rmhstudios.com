/**
 * The home feed's first paint.
 *
 * Two independent things decide whether `/` shows posts quickly, and both failed
 * silently — no test, no type error, no visual difference in development, where
 * everything is warm and fast. They are pinned here together because they are the
 * same story: the homepage looked like it streamed, and didn't.
 *
 *   1. THE SSR MARKUP. `RadialFeed` renders from the module-level `feedStore`,
 *      which is seeded from the streamed first page by a `useEffect`. Effects do
 *      not run during SSR, so the server rendered the SKELETON and the real
 *      rmharks appeared only after the entry bundle downloaded, parsed and
 *      hydrated. `shouldUseStreamedPage` is the fix, and its surface guard is
 *      subtle enough to be worth asserting directly.
 *
 *   2. THE WARM CACHE. `getTimeline`'s cache key includes `limit`, and neither
 *      caller normalises it. The boot warmup asked for 20 while the homepage
 *      asked for 15, so warmup primed a key nothing ever read: it reported
 *      success and the first anonymous visitor still paid the full cold timeline
 *      assembly. Nothing in the type system relates those two numbers, so this is
 *      asserted against the source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { shouldUseStreamedPage } from '@/components/radial/RadialFeed';

const ROOT = path.resolve(__dirname, '../..');

describe('RadialFeed — server-rendering the streamed first page', () => {
  const pristine = {
    initialized: false,
    storeCount: 0,
    filter: 'all',
    search: null,
    streamedCount: 15,
  };

  it('uses the streamed page while the store is pristine — this is the SSR path', () => {
    // The server render, and the first client render before the seeding effect.
    expect(shouldUseStreamedPage(pristine)).toBe(true);
  });

  it('yields to the store once it has been seeded', () => {
    // After hydrate() the store is the live surface: it receives SSE ticks, new
    // pages and optimistic posts, none of which the frozen streamed page has.
    expect(shouldUseStreamedPage({ ...pristine, initialized: true })).toBe(false);
    expect(shouldUseStreamedPage({ ...pristine, storeCount: 15 })).toBe(false);
  });

  it('does NOT resurrect the For-You page onto a filtered or searched surface', () => {
    // The regression this guard exists for: setFilter/setSearch reset the store to
    // `items: []` + `initialized: false` before fetching, which looks exactly like
    // a pristine store. Without the surface check the viewer would see the old
    // For-You posts flash back over the feed they just asked for.
    expect(shouldUseStreamedPage({ ...pristine, filter: 'following' })).toBe(false);
    expect(shouldUseStreamedPage({ ...pristine, search: 'hello' })).toBe(false);
  });

  it('falls through to the skeleton when there is genuinely nothing streamed', () => {
    // An empty streamed page must not be mistaken for content, or the wheel would
    // render an empty ring instead of the loading state.
    expect(shouldUseStreamedPage({ ...pristine, streamedCount: 0 })).toBe(false);
  });
});

describe('boot warmup primes the key the homepage actually reads', () => {
  /** Pull the `limit:` out of a getTimeline-shaped call in a source file. */
  function timelineLimit(relativePath: string): number {
    const src = readFileSync(path.join(ROOT, relativePath), 'utf8');
    const match = src.match(/surface:\s*'foryou'[\s\S]{0,200}?limit:\s*(\d+)/);
    if (!match) throw new Error(`no anonymous getTimeline call found in ${relativePath}`);
    return Number(match[1]);
  }

  it('warmup and the homepage request the same page size', () => {
    const warmup = timelineLimit('server/nitro/warmup.ts');
    const homepage = timelineLimit('app/routes/_site/index.tsx');

    // `limit` is part of the cache key and is not clamped on either path, so a
    // mismatch here does not degrade — it silently disables the warmup entirely.
    expect(warmup).toBe(homepage);
  });
});
