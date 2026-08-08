/**
 * The two Wiki-Race module mocks, in one place.
 *
 * `WikiRaceMinigame` reaches the network on `start()` (article fetch) and reads
 * the bundled article-pair dataset, so any test that starts a race has to
 * replace both. Two files needed them and each had grown its own copy — four
 * blocks of the same factory, two of them drifting on the article titles. Only
 * `security-state-masking.test.ts` still starts a race (the Wiki-Race rules
 * tests went out with the gameplay suites), but the mocks stay here rather than
 * inline: they are the reason that file can assert on masked state without
 * touching Wikipedia.
 *
 * They also lived INSIDE test bodies, which reads as "mock this for this test"
 * but is not what happens: `vi.mock` is hoisted to the top of the module and
 * runs before any test does. Vitest warns about that today and will make it an
 * error. Calling it once at the top of the file makes the code say what it
 * actually means.
 *
 * Use with a dynamic import so the factory body can't be evaluated before the
 * hoisted `vi.mock` call:
 *
 *   vi.mock('../../../lib/rmhbox/wiki-race/wikipedia-proxy', async () => {
 *     const { wikipediaProxyMock } = await import('./wiki-race-mocks');
 *     return wikipediaProxyMock();
 *   });
 */
import { vi } from 'vitest';

/** Article titles the fixtures agree on, so a mocked race can actually finish. */
export const START_ARTICLE = 'Start_Article';
export const TARGET_ARTICLE = 'Target_Article';

/**
 * `wikipedia-proxy` with no network: an in-memory cache and a fixed article
 * whose only outbound link is the target.
 */
export function wikipediaProxyMock() {
  return {
    createArticleCache: () => {
      const cache = new Map<string, unknown>();
      return {
        get: (key: string) => cache.get(key),
        set: (key: string, val: unknown) => cache.set(key, val),
        has: (key: string) => cache.has(key),
        delete: (key: string) => cache.delete(key),
        clear: () => cache.clear(),
        size: cache.size,
      };
    },
    fetchArticle: vi.fn().mockResolvedValue({
      title: 'Mock_Article',
      sanitizedHtml: `<p>Mock article content. <a data-wiki-target="${TARGET_ARTICLE}">Link</a></p>`,
      links: new Set([TARGET_ARTICLE, 'Other_Article', 'Another_Article']),
    }),
  };
}

/** `data-loader` with one deterministic start/target pair. */
export function dataLoaderMock() {
  return {
    selectArticlePair: () => ({
      id: 'test-pair-001',
      startArticle: {
        title: START_ARTICLE,
        url: `https://en.wikipedia.org/wiki/${START_ARTICLE}`,
        description: 'The starting article for this race',
      },
      targetArticle: {
        title: TARGET_ARTICLE,
        url: `https://en.wikipedia.org/wiki/${TARGET_ARTICLE}`,
        description: 'The target article to reach',
      },
      optimalPathLength: 4,
      difficulty: 'medium' as const,
      tags: ['test'],
    }),
    pairKey: (pair: { startArticle: { title: string }; targetArticle: { title: string } }) =>
      `${pair.startArticle.title}::${pair.targetArticle.title}`,
  };
}
