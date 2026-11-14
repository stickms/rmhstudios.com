/**
 * A public `auth: 'none'` route whose data has a write path that invalidates an
 * in-process cache (or can flip visibility) must opt out of the per-worker
 * response micro-cache with `microCache: false`: `invalidateCached*` does not
 * reach it, so the route would serve the pre-write body for up to 30 s.
 * See lib/api/response-cache.server.ts.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { apiSourcePaths } from '@/lib/api/route-sources';

const ROOT =
  join(
    __dirname,
    '..',
    '..',
  );

/** Cache/auth plumbing: defines invalidate(), says nothing about the route's own data. */
const INFRA =
  new Set(
    [
      'lib/cached.server',
      'lib/auth',
    ],
  );

/** Whole-file signal that the route's own data source clears an in-process cache. */
function invalidates(
  src: string,
): boolean {
  return /\binvalidate\w*\s*\(/.test(
    src,
  );
}

describe('micro-cache opt-out', () => {
  // Route files and the registered endpoints (lib/api/route-sources.ts) alike.
  const routes =
    apiSourcePaths(
      ROOT,
    ).filter(
      (
        f,
      ) => {
        const s =
          readFileSync(
            f,
            'utf8',
          );
        return (
          /auth: 'none'/.test(
            s,
          ) &&
          /(visibility: 'public'|CACHE_POLICY\.)/.test(
            s,
          )
        );
      },
    );

  it('finds the public routes', () =>
    expect(
      routes.length,
    ).toBeGreaterThan(
      30,
    ));

  it('every public route whose lib data source invalidates declares microCache: false', () => {
    const offenders: string[] =
      [];
    for (const f of routes) {
      const src =
        readFileSync(
          f,
          'utf8',
        );
      const libs =
        [
          ...src.matchAll(
            /from '@\/(lib\/[^']+)'/g,
          ),
        ]
          .filter(
            (
              m,
            ) =>
              !INFRA.has(
                m[1],
              ),
          )
          .map(
            (
              m,
            ) =>
              join(
                ROOT,
                `${m[1]}.ts`,
              ),
          );
      const dataInvalidates =
        invalidates(
          src,
        ) ||
        libs.some(
          (
            l,
          ) =>
            existsSync(
              l,
            ) &&
            invalidates(
              readFileSync(
                l,
                'utf8',
              ),
            ),
        );
      if (
        dataInvalidates &&
        !/microCache:\s*false/.test(
          src,
        )
      )
        offenders.push(
          f.replace(
            ROOT,
            '',
          ),
        );
    }
    expect(
      offenders,
    ).toEqual(
      [],
    );
  });

  it('visibility-flippable and write-then-read routes opt out', () => {
    for (const f of [
      'lib/wishlist/api/users.$id.wishlist.server.ts',
      'lib/tournaments/api/tournaments.server.ts',
      'lib/achievements/api/achievements.$userId.server.ts',
    ])
      expect(
        readFileSync(
          join(
            ROOT,
            f,
          ),
          'utf8',
        ),
      ).toMatch(
        /microCache:\s*false/,
      );
  });
});
