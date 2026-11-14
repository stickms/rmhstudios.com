import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  it,
} from 'vitest';

const root =
  join(
    __dirname,
    '..',
  );

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

it('the sandboxed relay hub imports nothing from the site', () => {
  const banned =
    /(?:from|import|require)\s*\(?\s*['"](?:@\/lib|lib\/|@\/components|@\/app|@\/server\/shared)/;
  const all =
    files(
      root,
    );
  expect(
    all.length,
  ).toBeGreaterThan(
    0,
  );
  for (const f of all)
    expect(
      banned.test(
        readFileSync(
          f,
          'utf8',
        ),
      ),
      f,
    ).toBe(
      false,
    );
});
