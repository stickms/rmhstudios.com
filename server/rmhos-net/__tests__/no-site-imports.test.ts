import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import {
  dirname,
  join,
  relative,
  resolve,
} from 'node:path';
import {
  expect,
  it,
} from 'vitest';

const root =
  join(
    __dirname,
    '..',
  );
const repo =
  resolve(
    root,
    '..',
    '..',
  );
const ALLOWED_FEATURES =
  new Set(
    [
      '@features/rmhos/engine/constants',
      '@features/rmhos/engine/net-ticket.server',
    ],
  );
const SITE_DIRS =
  [
    'lib',
    'components',
    'app',
    'server/shared',
  ];

function files(
  dir: string,
): string[] {
  return readdirSync(
    dir,
    {
      withFileTypes: true,
    },
  ).flatMap(
    (
      e,
    ) => {
      if (
        e.name ===
        '__tests__'
      )
        return [];
      const full =
        join(
          dir,
          e.name,
        );
      return e.isDirectory()
        ? files(
            full,
          )
        : e.name.endsWith(
              '.ts',
            )
          ? [
              full,
            ]
          : [];
    },
  );
}

function specifiers(
  src: string,
): string[] {
  return [
    ...src.matchAll(
      /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g,
    ),
  ].map(
    (
      m,
    ) =>
      m[1] as string,
  );
}

it('the sandboxed relay hub imports nothing from the site', () => {
  const banned =
    /^(?:@\/lib|lib\/|@\/components|@\/app|@\/server\/shared)/;
  const all =
    files(
      root,
    );
  expect(
    all.length,
  ).toBeGreaterThan(
    0,
  );
  for (const f of all) {
    for (const spec of specifiers(
      readFileSync(
        f,
        'utf8',
      ),
    )) {
      expect(
        banned.test(
          spec,
        ),
        `${f}: ${spec}`,
      ).toBe(
        false,
      );
      if (
        spec.startsWith(
          '.',
        )
      ) {
        const rel =
          relative(
            repo,
            resolve(
              dirname(
                f,
              ),
              spec,
            ),
          );
        const hit =
          SITE_DIRS.some(
            (
              d,
            ) =>
              rel ===
                d ||
              rel.startsWith(
                `${d}/`,
              ),
          );
        expect(
          hit,
          `${f}: relative import into the site: ${spec}`,
        ).toBe(
          false,
        );
      }
      if (
        spec.startsWith(
          '@features/',
        )
      )
        expect(
          ALLOWED_FEATURES.has(
            spec,
          ),
          `${f}: ${spec}`,
        ).toBe(
          true,
        );
    }
  }
});
