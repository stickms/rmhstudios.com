/**
 * The public page of a shared result, `/rmhmusic/r/$token` (Phase 6, plan 1.4), read at source
 * level as the Open Graph gates read routes. The sitemap leaves it out (a capability link, never
 * listed), so `og-page-coverage.test.ts` does not reach it; this holds it to the same three rules
 * plus what a capability link needs:
 *
 * 1. its `head()` goes through `buildMeta`, names its own card (`ogCardPath('music', …)`) and its
 *    own copy, and says `noindex, nofollow`;
 * 2. it is its own route file, outside the auth-gated `/rmhmusic` layout, so a signed-out viewer
 *    (and an unfurl bot) gets the page, not a redirect to sign in;
 * 3. `robots.txt` does not disallow it: Twitterbot and LinkedInBot honour robots.txt before
 *    fetching a page or its image, so a disallowed link would never unfurl;
 * 4. the sitemap lists it as `null`, and the sign-in return allowlist does not take it.
 */
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { DYNAMIC_ROUTES } from '@/lib/sitemap';
import { rmhmusicReturnPath } from '../return-path';

const ROOT =
  process.cwd();
const ROUTE =
  join(
    ROOT,
    'app/routes/rmhmusic_.r.$token.tsx',
  );
const read =
  (
    p: string,
  ) =>
    readFileSync(
      p,
      'utf8',
    );

describe('the shared result page', () => {
  it('is a route file of its own, outside the auth-gated layout', () => {
    expect(
      existsSync(
        ROUTE,
      ),
    ).toBe(
      true,
    );
    expect(
      existsSync(
        join(
          ROOT,
          'app/routes/rmhmusic/r.$token.tsx',
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      read(
        ROUTE,
      ),
    ).toMatch(
      /createFileRoute\(\s*'\/rmhmusic_\/r\/\$token'\s*,?\s*\)/,
    );
  });

  it('heads itself through buildMeta, with its own card and noindex, nofollow', () => {
    const src =
      read(
        ROUTE,
      );
    expect(
      src,
    ).toMatch(
      /\bbuildMeta\(/,
    );
    expect(
      src,
    ).toMatch(
      /\bogCardPath\(\s*'music'/,
    );
    expect(
      src,
    ).toMatch(
      /content:\s*'noindex, nofollow'/,
    );
    // No hand-rolled Open Graph tags: buildMeta owns the whole block.
    expect(
      src,
    ).not.toMatch(
      /property:\s*'og:/,
    );
  });

  it('is not disallowed by robots.txt, so unfurl bots can read it and its card', () => {
    // The longest matching rule wins (RFC 9309 2.2.2), Allow on a tie.
    const robots =
      read(
        join(
          ROOT,
          'public/robots.txt',
        ),
      );
    const rules =
      [
        ...robots.matchAll(
          /^(Allow|Disallow):\s*(\S+)/gim,
        ),
      ].map(
        (
          m,
        ) => ({
          allow:
            m[1]!.toLowerCase() ===
            'allow',
          path: m[2]!.replace(
            /\*$/,
            '',
          ),
        }),
      );
    for (const path of [
      '/rmhmusic/r/AbCdEfGhIjKlMnOpQrSt_-',
      '/api/og/music/AbCdEfGhIjKlMnOpQrSt_-',
    ]) {
      const hits =
        rules
          .filter(
            (
              r,
            ) =>
              path.startsWith(
                r.path,
              ),
          )
          .sort(
            (
              a,
              b,
            ) =>
              b
                .path
                .length -
                a
                  .path
                  .length ||
              Number(
                b.allow,
              ) -
                Number(
                  a.allow,
                ),
          );
      expect(
        hits[0]
          ?.allow ??
          true,
        `${path} is disallowed by ${hits[0]?.path}`,
      ).toBe(
        true,
      );
    }
  });

  it('is never listed in the sitemap, and is not a sign-in return path', () => {
    expect(
      DYNAMIC_ROUTES,
    ).toHaveProperty(
      [
        '/rmhmusic/r/$token',
      ],
      null,
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/r/AbCdEfGhIjKlMnOpQrSt_-',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });
});
