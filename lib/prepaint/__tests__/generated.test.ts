import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { generate } from '../../../scripts/build-prepaint';
import {
  buildPrepaintConfig,
  prepaintHeadScripts,
} from '../config';
import {
  PREPAINT_BODY_CODE,
  PREPAINT_BODY_SHA256,
  PREPAINT_CODE,
  PREPAINT_SHA256,
} from '../generated';

describe('generated pre-paint script', () => {
  it('lib/prepaint/generated.ts is fresh (run `pnpm prepaint:build` if this fails)', async () => {
    const onDisk =
      readFileSync(
        join(
          __dirname,
          '..',
          'generated.ts',
        ),
        'utf8',
      );
    expect(
      onDisk,
    ).toBe(
      await generate(),
    );
  });

  it('exports the base64 sha256 of the exact text (for a CSP hash)', () => {
    const h =
      (
        s: string,
      ) =>
        createHash(
          'sha256',
        )
          .update(
            s,
            'utf8',
          )
          .digest(
            'base64',
          );
    expect(
      PREPAINT_SHA256,
    ).toBe(
      h(
        PREPAINT_CODE,
      ),
    );
    expect(
      PREPAINT_BODY_SHA256,
    ).toBe(
      h(
        PREPAINT_BODY_CODE,
      ),
    );
  });

  it('is ASCII, safe inside <script>, and carries no per-request or per-catalog data', () => {
    expect(
      PREPAINT_CODE,
    ).not.toMatch(
      /[^\x20-\x7e]/,
    );
    expect(
      PREPAINT_CODE,
    ).not.toMatch(
      /<\/script/i,
    );
    // The catalog-derived tables ride in the JSON block, never in the code.
    expect(
      PREPAINT_CODE,
    ).not.toContain(
      'steam-library-theme',
    );
    expect(
      PREPAINT_CODE,
    ).not.toContain(
      '/studio/themes',
    );
  });

  it('the head emits the data block first, then the one script', () => {
    const scripts =
      prepaintHeadScripts(
        {
          seed: {
            'rmh-style':
              'default',
          },
        },
      );
    expect(
      scripts,
    ).toHaveLength(
      2,
    );
    expect(
      scripts[0],
    ).toMatchObject(
      {
        type: 'application/json',
        id: 'rmh-prepaint',
      },
    );
    expect(
      JSON.parse(
        scripts[0]
          .children,
      )
        .seed,
    ).toEqual(
      {
        'rmh-style':
          'default',
      },
    );
    expect(
      scripts[1],
    ).toEqual(
      {
        children:
          PREPAINT_CODE,
      },
    );
  });

  it('the variants are data: 404 and Discord flags, and an empty seed is omitted', () => {
    expect(
      buildPrepaintConfig()
        .nf,
    ).toBeUndefined();
    expect(
      buildPrepaintConfig(
        {
          notFound: true,
        },
      )
        .nf,
    ).toBe(
      true,
    );
    expect(
      buildPrepaintConfig(
        {
          discord: true,
        },
      )
        .discord,
    ).toBe(
      true,
    );
    expect(
      buildPrepaintConfig(
        {
          seed: {},
        },
      )
        .seed,
    ).toBeUndefined();
  });
});
