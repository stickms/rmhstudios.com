import {
  describe,
  expect,
  it,
} from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

/**
 * The generated tree imports every route module (auth, prisma, ...), which takes tens of seconds
 * to load in a unit test. So this holds the two halves apart: the generated tree really contains
 * `/rmhos`, and a router built with the same defaults as app/router.tsx (no `caseSensitive`)
 * matches that path whatever the case of the URL.
 */
describe('/rmhos route', () => {
  it('is in the generated route tree', () => {
    const tree =
      readFileSync(
        resolve(
          __dirname,
          '../../../app/routeTree.gen.ts',
        ),
        'utf8',
      );
    expect(
      tree,
    ).toMatch(
      /'\/rmhos':\s*typeof RmhosRoute/,
    );
    expect(
      tree,
    ).toMatch(
      /path:\s*'\/rmhos'/,
    );
  });

  it('is not case-sensitive in app/router.tsx', () => {
    const router =
      readFileSync(
        resolve(
          __dirname,
          '../../../app/router.tsx',
        ),
        'utf8',
      );
    expect(
      router,
    ).not.toMatch(
      /caseSensitive:\s*true/,
    );
  });

  it('resolves /rmhos, /rmhOS and /RMHOS to the same route', () => {
    const root =
      createRootRoute();
    const rmhos =
      createRoute(
        {
          getParentRoute:
            () =>
              root,
          path: '/rmhos',
        },
      );
    const routeTree =
      root.addChildren(
        [
          rmhos,
        ],
      );
    const ids =
      (
        path: string,
      ) => {
        const router =
          createRouter(
            {
              routeTree,
              history:
                createMemoryHistory(
                  {
                    initialEntries:
                      [
                        path,
                      ],
                  },
                ),
            },
          );
        return router
          .matchRoutes(
            path,
            {},
          )
          .map(
            (
              m,
            ) =>
              m.routeId,
          );
      };
    expect(
      ids(
        '/rmhos',
      ),
    ).toContain(
      '/rmhos',
    );
    expect(
      ids(
        '/rmhOS',
      ),
    ).toEqual(
      ids(
        '/rmhos',
      ),
    );
    expect(
      ids(
        '/RMHOS',
      ),
    ).toEqual(
      ids(
        '/rmhos',
      ),
    );
  });
});
