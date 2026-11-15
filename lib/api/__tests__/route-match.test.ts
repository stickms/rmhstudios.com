import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  compileRoutes,
  templateSegments,
  trimTrailingSlashes,
} from '@/lib/api/route-match';

/**
 * The API route table's matcher answers as TanStack Router did for the route files it
 * replaced (third-pass audit AR3). The unit cases name each rule; the last block runs
 * the router itself over the same templates and compares every answer.
 */

const table =
  (
    paths: string[],
  ) =>
    compileRoutes(
      paths.map(
        (
          path,
        ) => ({
          path,
          value:
            path,
        }),
      ),
    );

describe('compileRoutes', () => {
  it('matches a static path and reports its template', () => {
    const m =
      table(
        [
          '/api/admin/flags',
        ],
      ).match(
        '/api/admin/flags',
      );
    expect(
      m?.template,
    ).toBe(
      '/api/admin/flags',
    );
    expect(
      m?.params,
    ).toEqual(
      {},
    );
  });

  it('a static segment beats a param at the same position', () => {
    const t =
      table(
        [
          '/api/posts/$id',
          '/api/posts/trending',
        ],
      );
    expect(
      t.match(
        '/api/posts/trending',
      )
        ?.template,
    ).toBe(
      '/api/posts/trending',
    );
    expect(
      t.match(
        '/api/posts/abc',
      )
        ?.template,
    ).toBe(
      '/api/posts/$id',
    );
  });

  it('an earlier static outweighs a later one, and a dead end backtracks to the param', () => {
    const t =
      table(
        [
          '/api/a/$x/c',
          '/api/$y/b/c',
          '/api/a/b/$z',
          '/api/a/b/only',
        ],
      );
    // static at segment 2 and 3 beats static at 2 and 4
    expect(
      t.match(
        '/api/a/b/c',
      )
        ?.template,
    ).toBe(
      '/api/a/b/$z',
    );
    // `/api/a/q` has no `q/c`... but `$x/c` does
    expect(
      t.match(
        '/api/a/q/c',
      )
        ?.template,
    ).toBe(
      '/api/a/$x/c',
    );
    // the static branch `a` has nothing for `z/b/c`; the param branch does
    expect(
      t.match(
        '/api/z/b/c',
      )
        ?.template,
    ).toBe(
      '/api/$y/b/c',
    );
    expect(
      t.match(
        '/api/z/z/z',
      ),
    ).toBeNull();
  });

  it('delivers params by the names in the winning template, decoded', () => {
    const t =
      table(
        [
          '/api/a/$id/b/$slug',
          '/api/a/$other',
        ],
      );
    expect(
      t.match(
        '/api/a/1/b/two',
      )
        ?.params,
    ).toEqual(
      {
        id: '1',
        slug: 'two',
      },
    );
    expect(
      t.match(
        '/api/a/x%20y',
      )
        ?.params,
    ).toEqual(
      {
        other:
          'x y',
      },
    );
    expect(
      t.match(
        '/api/a/x%2Fy',
      )
        ?.params,
    ).toEqual(
      {
        other:
          'x/y',
      },
    );
    expect(
      t.match(
        '/api/a/%E4%BD%A0',
      )
        ?.params,
    ).toEqual(
      {
        other:
          '你',
      },
    );
  });

  it('a segment that does not decode matches nothing', () => {
    expect(
      table(
        [
          '/api/a/$id',
        ],
      ).match(
        '/api/a/%E0%A4%A',
      ),
    ).toBeNull();
  });

  it('params are a prototype-less record', () => {
    const params =
      table(
        [
          '/api/a/$constructor',
        ],
      ).match(
        '/api/a/x',
      )!.params;
    expect(
      Object.getPrototypeOf(
        params,
      ),
    ).toBeNull();
    expect(
      params.constructor,
    ).toBe(
      'x',
    );
  });

  it('static segments compare case-insensitively; param values keep their case', () => {
    const t =
      table(
        [
          '/api/Admin/flags/$id',
        ],
      );
    expect(
      t.match(
        '/API/admin/FLAGS/AbC',
      )
        ?.params,
    ).toEqual(
      {
        id: 'AbC',
      },
    );
  });

  it('ignores trailing slashes on the request and on the template', () => {
    const t =
      table(
        [
          '/api/activity/',
          '/api/x/$id',
        ],
      );
    expect(
      t.match(
        '/api/activity',
      )
        ?.template,
    ).toBe(
      '/api/activity/',
    );
    expect(
      t.match(
        '/api/activity/',
      )
        ?.template,
    ).toBe(
      '/api/activity/',
    );
    expect(
      t.match(
        '/api/activity//',
      )
        ?.template,
    ).toBe(
      '/api/activity/',
    );
    expect(
      t.match(
        '/api/x/1/',
      )
        ?.params,
    ).toEqual(
      {
        id: '1',
      },
    );
  });

  it('an empty segment never matches a param', () => {
    const t =
      table(
        [
          '/api/x/$id',
          '/api/x/$id/y',
        ],
      );
    expect(
      t.match(
        '/api/x//y',
      ),
    ).toBeNull();
    expect(
      t.match(
        '/api//1',
      ),
    ).toBeNull();
  });

  it('a longer or shorter path does not match', () => {
    const t =
      table(
        [
          '/api/x/$id',
        ],
      );
    expect(
      t.match(
        '/api/x',
      ),
    ).toBeNull();
    expect(
      t.match(
        '/api/x/1/2',
      ),
    ).toBeNull();
    expect(
      t.match(
        '/api',
      ),
    ).toBeNull();
    expect(
      t.match(
        '/',
      ),
    ).toBeNull();
  });

  it('refuses two routes for one path, including ones that differ only in a param name', () => {
    expect(
      () =>
        table(
          [
            '/api/a',
            '/api/a/',
          ],
        ),
    ).toThrow(
      /same path/,
    );
    expect(
      () =>
        table(
          [
            '/api/a/$id',
            '/api/a/$slug',
          ],
        ),
    ).toThrow(
      /same path/,
    );
    expect(
      () =>
        table(
          [
            '/api/A',
            '/api/a',
          ],
        ),
    ).toThrow(
      /same path/,
    );
  });

  it('refuses segments it cannot match the way the router does', () => {
    expect(
      () =>
        templateSegments(
          '/api/files/$',
        ),
    ).toThrow(
      /unsupported/,
    );
    expect(
      () =>
        templateSegments(
          '/api/x/{-$opt}',
        ),
    ).toThrow(
      /unsupported/,
    );
    expect(
      () =>
        templateSegments(
          '/api/x/file.{$ext}',
        ),
    ).toThrow(
      /unsupported/,
    );
    expect(
      () =>
        templateSegments(
          '/api/x//y',
        ),
    ).toThrow(
      /unsupported/,
    );
    expect(
      templateSegments(
        '/api/elections/races.csv',
      ),
    ).toEqual(
      [
        'api',
        'elections',
        'races.csv',
      ],
    );
  });

  it('trimTrailingSlashes leaves the root alone', () => {
    expect(
      trimTrailingSlashes(
        '/',
      ),
    ).toBe(
      '/',
    );
    expect(
      trimTrailingSlashes(
        '/a//',
      ),
    ).toBe(
      '/a',
    );
  });
});

describe('agrees with TanStack Router', () => {
  const templates =
    [
      '/api/a',
      '/api/a/$id',
      '/api/a/b',
      '/api/a/$id/c',
      '/api/a/b/$z',
      '/api/a/$id/c/$d',
      '/api/$y/b/c',
      '/api/a/b/c/d',
      '/api/idx/',
      '/api/idx/$id/',
      '/api/dots/calendar.ics',
      '/api/dots/$file',
      '/api/Mixed/Case',
    ];
  const root =
    createRootRoute();
  root.addChildren(
    templates.map(
      (
        path,
      ) =>
        createRoute(
          {
            getParentRoute:
              () =>
                root,
            path,
          },
        ),
    ),
  );
  const router =
    createRouter(
      {
        routeTree:
          root,
        history:
          createMemoryHistory(),
      },
    );
  const mine =
    table(
      templates,
    );

  const words =
    [
      'a',
      'b',
      'c',
      'd',
      'idx',
      'dots',
      'calendar.ics',
      'Mixed',
      'mixed',
      'CASE',
      'x%20y',
      'q',
      '',
    ];
  const paths: string[] =
    [];
  for (const w1 of words)
    for (const w2 of words)
      for (const w3 of [
        '',
        ...words,
      ])
        for (const w4 of [
          '',
          'd',
          'q',
        ]) {
          const tail =
            [
              w1,
              w2,
              w3,
              w4,
            ]
              .join(
                '/',
              )
              .replace(
                /\/+$/,
                '',
              );
          paths.push(
            `/api/${tail}`,
            `/api/${tail}/`,
          );
        }

  it(`over ${paths.length} paths`, () => {
    for (const path of new Set(
      paths,
    )) {
      const [
        ,
        rawParams,
        found,
      ] =
        router.getMatchedRoutes(
          path,
        );
      const exact =
        found &&
        rawParams[
          '**'
        ] ===
          undefined
          ? found
          : undefined;
      const got =
        mine.match(
          path,
        );
      expect(
        got?.template ??
          null,
        path,
      ).toBe(
        exact?.fullPath ??
          null,
      );
      if (
        exact
      )
        expect(
          {
            ...got!
              .params,
          },
          path,
        ).toEqual(
          {
            ...rawParams,
          },
        );
    }
  });
});
