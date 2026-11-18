import {
  describe,
  expect,
  it,
} from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// GHSA-fc5q-39xc-vjpf: resolve the picomatch copy tinyglobby actually loads.
const require =
  createRequire(
    import.meta
      .url,
  );
const tinyglobbyRequire =
  createRequire(
    require.resolve('tinyglobby'),
  );
// picomatch is a transitive dependency without its own types here, so type the
// two calls this test makes.
const picomatch =
  tinyglobbyRequire(
    'picomatch',
  ) as {
    makeRe(
      glob: string,
    ): RegExp;
    isMatch(
      input: string,
      glob: string,
    ): boolean;
  };

describe('picomatch repeated extglob ReDoS (GHSA-fc5q-39xc-vjpf)', () => {
  it.each(
    [
      '+(*)',
      '+(*a)',
      '*(?*)',
      '+(+(a))',
    ],
  )(
    '%s does not backtrack exponentially',
    (
      glob,
    ) => {
      const re =
        picomatch.makeRe(
          glob,
        );
      const input =
        'a'.repeat(
          40,
        ) +
        '!';
      const start =
        performance.now();
      re.test(
        input,
      );
      expect(
        performance.now() -
          start,
      ).toBeLessThan(
        200,
      );
    },
  );

  it('keeps ordinary globs working', () => {
    expect(
      picomatch.isMatch(
        'src/routes/a.tsx',
        'src/routes/**/*.tsx',
      ),
    ).toBe(
      true,
    );
    expect(
      picomatch.isMatch(
        'a.js',
        '*.+(js|ts)',
      ),
    ).toBe(
      true,
    );
    expect(
      picomatch.isMatch(
        'aaa',
        '+(a)',
      ),
    ).toBe(
      true,
    );
    expect(
      picomatch.isMatch(
        'ab',
        '+(*(a)|*(b))',
      ),
    ).toBe(
      true,
    );
  });

  it('is registered as a patched dependency with an audit ignore', () => {
    const pkg =
      JSON.parse(
        readFileSync(
          join(
            process.cwd(),
            'package.json',
          ),
          'utf8',
        ),
      );
    expect(
      pkg
        .pnpm
        .patchedDependencies[
        'picomatch@4.0.7'
      ],
    ).toBe(
      'patches/picomatch@4.0.7.patch',
    );
    expect(
      pkg
        .pnpm
        .auditConfig
        .ignoreGhsas,
    ).toContain(
      'GHSA-fc5q-39xc-vjpf',
    );
  });
});
