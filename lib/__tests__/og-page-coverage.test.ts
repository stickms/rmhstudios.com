/**
 * Every public page unfurls as itself (docs/open-graph.md §0, design.md §7).
 *
 * A link to a page is the page's first impression for anyone not on the site
 * yet, and the failure is invisible from inside it: a route with no
 * `buildMeta`, or one whose path matches no section card, unfurls as the
 * site-wide default card — the same picture and copy as every other forgotten
 * page. So this holds the rule for every route the sitemap lists as public:
 *
 *   1. its `head()` goes through `buildMeta` (or a helper built on it:
 *      `definePage`, `gameRouteHead`, `appRouteHead`, `appHubHead`), never
 *      hand-rolled tags;
 *   2. a page about one thing (a `$param` route) names its own card, with
 *      `ogCardPath(kind, id)`, `definePage`'s `ogCard`, or an `image:`;
 *   3. any other page resolves to a section card in `lib/og/static-cards.ts`,
 *      never the site-wide default, unless it is the home page.
 *
 * Routes the sitemap excludes (admin, settings, composers, capability URLs) are
 * not shared publicly and are out of scope.
 *
 * `BACKLOG` is the routes that broke the rule when it was written. It is
 * one-directional like the repo's other ratchets: an entry comes out when its
 * route is fixed (the test fails until it does), and nothing goes in.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  join,
  relative,
  resolve,
} from 'node:path';
import {
  DYNAMIC_ROUTES,
  STATIC_ROUTES,
} from '@/lib/sitemap';
import { staticCardFor } from '@/lib/og/static-cards';

const ROOT =
  process.cwd();
const ROUTES_DIR =
  resolve(
    ROOT,
    'app/routes',
  );

function pageRouteFiles(
  dir = ROUTES_DIR,
  acc: string[] = [],
): string[] {
  for (const entry of readdirSync(
    dir,
  )) {
    const full =
      join(
        dir,
        entry,
      );
    if (
      statSync(
        full,
      ).isDirectory()
    ) {
      if (
        entry !==
        'api'
      )
        pageRouteFiles(
          full,
          acc,
        );
    } else if (
      entry.endsWith(
        '.tsx',
      )
    )
      acc.push(
        full,
      );
  }
  return acc;
}

/** The URL path a route file serves (TanStack file naming; see sitemap-coverage.test.ts). */
function urlPathFor(
  file: string,
):
  | string
  | null {
  const rel =
    relative(
      ROUTES_DIR,
      file,
    )
      .replaceAll(
        '\\',
        '/',
      )
      .replace(
        /\.tsx$/,
        '',
      );
  if (
    rel ===
      '__root' ||
    rel ===
      '_site'
  )
    return null;
  const segments =
    rel
      .split(
        '[.]',
      )
      .join(
        '__ESCAPED_DOT__',
      )
      .split(
        '/',
      )
      .flatMap(
        (
          s,
        ) =>
          s.split(
            '.',
          ),
      )
      .map(
        (
          s,
        ) =>
          s
            .split(
              '__ESCAPED_DOT__',
            )
            .join(
              '.',
            ),
      )
      .filter(
        (
          s,
        ) =>
          s !==
            '' &&
          !s.startsWith(
            '_',
          ),
      )
      .map(
        (
          s,
        ) =>
          s.endsWith(
            '_',
          )
            ? s.slice(
                0,
                -1,
              )
            : s,
      );
  const last =
    segments[
      segments.length -
        1
    ];
  if (
    last ===
      'index' ||
    last ===
      'route'
  )
    segments.pop();
  return `/${segments.join('/')}`;
}

const PUBLIC =
  new Set<string>(
    [
      ...STATIC_ROUTES.map(
        (
          r,
        ) =>
          r.loc.split(
            '?',
          )[0] ||
          '/',
      ),
      ...Object.entries(
        DYNAMIC_ROUTES,
      )
        .filter(
          ([
            ,
            section,
          ]) =>
            section !==
            null,
        )
        .map(
          ([
            path,
          ]) =>
            path,
        ),
    ],
  );

const HEAD_HELPER =
  /\b(buildMeta|definePage|gameRouteHead|appRouteHead|appHubHead)\(/;

/**
 * A layout: `route.tsx`, or `x.tsx` next to an `x/` directory. Its page is the
 * index route inside, which is checked on its own.
 */
function isLayout(
  file: string,
): boolean {
  if (
    file.endsWith(
      '/route.tsx',
    )
  )
    return true;
  try {
    return statSync(
      file.replace(
        /\.tsx$/,
        '',
      ),
    ).isDirectory();
  } catch {
    return false;
  }
}

/** Why a public route breaks the rule, or null when it keeps it. */
function violation(
  file: string,
  path: string,
):
  | string
  | null {
  const src =
    readFileSync(
      file,
      'utf8',
    );
  if (
    !/component:/.test(
      src,
    ) ||
    isLayout(
      file,
    )
  )
    return null; // a redirect stub or a layout renders no page of its own
  if (
    !HEAD_HELPER.test(
      src,
    )
  )
    return 'head() does not go through buildMeta';
  if (
    /\bgameRouteHead\(|\bappRouteHead\(|\bappHubHead\(/.test(
      src,
    )
  )
    return null; // catalog cards
  const namesCard =
    /\bogCardPath\(|\bogCard:|\bimage:\s/.test(
      src,
    );
  if (
    path.includes(
      '$',
    )
  )
    return namesCard
      ? null
      : 'a page about one thing does not name its own card';
  if (
    namesCard ||
    path ===
      '/'
  )
    return null;
  const card =
    staticCardFor(
      path,
    );
  return card &&
    card.path !==
      '/'
    ? null
    : 'resolves to the site-wide default card';
}

/**
 * Public routes that broke the rule on 2026-11-15. Entries only come out.
 */
const BACKLOG: Record<
  string,
  string
> =
  {
    // Pages about one thing with no card kind of their own yet: each needs an
    // /api/og/<kind>/<id> renderer before it can name one.
    'app/routes/_site/jams.$slug.tsx':
      'no jam card kind',
    'app/routes/_site/study/$deckId.tsx':
      'no deck card kind',
    'app/routes/_site/tournaments.$id.tsx':
      'no tournament card kind',
    // Hand-rolled og:* arrays built from loader data. Profiles and posts already
    // point at their own rendered cards; the move is onto buildMeta.
    'app/routes/_site/u/$userid/index.tsx':
      'hand-rolled meta (has its own card)',
    'app/routes/_site/u/$userid/post/$postid.tsx':
      'hand-rolled meta (has its own card)',
    'app/routes/_site/news/$slug.tsx':
      'hand-rolled meta',
    'app/routes/library.$slug.tsx':
      'hand-rolled meta',
    // Full-screen standalone pages with their own head.
    'app/routes/black-lives-matter.tsx':
      'hand-rolled meta',
    'app/routes/security.tsx':
      'hand-rolled meta',
  };

const results =
  pageRouteFiles()
    .map(
      (
        file,
      ) => ({
        file: relative(
          ROOT,
          file,
        ),
        path: urlPathFor(
          file,
        ),
      }),
    )
    .filter(
      (
        r,
      ): r is {
        file: string;
        path: string;
      } =>
        r.path !==
          null &&
        PUBLIC.has(
          r.path,
        ),
    )
    .map(
      (
        r,
      ) => ({
        ...r,
        problem:
          violation(
            resolve(
              ROOT,
              r.file,
            ),
            r.path,
          ),
      }),
    );

describe('every public page has its own Open Graph card', () => {
  it('finds the public routes it is meant to check', () => {
    expect(
      results.length,
    ).toBeGreaterThan(
      50,
    );
  });

  it('no public route outside the backlog falls back to a generic unfurl', () => {
    const failing =
      results
        .filter(
          (
            r,
          ) =>
            r.problem &&
            !(
              r.file in
              BACKLOG
            ),
        )
        .map(
          (
            r,
          ) =>
            `${r.file} (${r.path}): ${r.problem}`,
        );
    expect(
      failing,
      'give these routes buildMeta with their own card (docs/open-graph.md §0)',
    ).toEqual(
      [],
    );
  });

  it('the backlog only shrinks: a fixed route comes off it', () => {
    const fixed =
      Object.keys(
        BACKLOG,
      ).filter(
        (
          file,
        ) =>
          !results.some(
            (
              r,
            ) =>
              r.file ===
                file &&
              r.problem,
          ),
      );
    expect(
      fixed,
      'these keep the rule now; delete their BACKLOG entries',
    ).toEqual(
      [],
    );
  });
});
