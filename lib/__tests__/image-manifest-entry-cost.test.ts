/**
 * The image variant manifest is paid for on every page: hold its size.
 *
 * `lib/images/variants.gen.ts` lists every picture under `public/images/` that has
 * build-time widths. `components/ui/OptimizedImage.tsx` imports it statically, and
 * the shell renders OptimizedImage, so the whole manifest lands in the client entry:
 * every row is downloaded and parsed before any page can hydrate, whether or not
 * that page shows the picture.
 *
 * That cost is easy to add by accident and slow to notice. The bundle budget
 * (`scripts/check-bundle-budget.ts`) does catch it, but only after a full
 * production build (about 25 minutes in CI, and in the deploy's image build). On
 * 2026-11-17 the /site-history page (#1671) drew its ~120 screenshots through
 * OptimizedImage; the generator added 117 rows, about 11 KB, to the entry, the PR
 * was merged before its build job reached the budget step, and the deploy was
 * blocked at the end of the image build. The fix (#1672) put the folder on the
 * generator's EXCLUDED list.
 *
 * This test checks the same thing in milliseconds, in the commit gate and in
 * `pnpm test`, by reading the manifest itself:
 *
 *  - the manifest stays under a byte budget, with about 1 KB of headroom;
 *  - no one folder under public/images/ contributes more than a page's worth of
 *    rows (a whole gallery for one page belongs in EXCLUDED, drawn with a plain
 *    lazy <img>);
 *  - the folders that were excluded for this reason stay excluded.
 *
 * Raising the budget means the entry grows, so it needs the same OPT-01 line in
 * scripts/check-bundle-budget.ts that names the feature that bought the bytes. If
 * the manifest ever stops being a static import of the entry (loaded lazily, or
 * fetched), the premise check below fails: delete this test then, do not loosen it.
 */
import {
  readFileSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';

const ROOT =
  resolve(
    __dirname,
    '../..',
  );
const MANIFEST =
  resolve(
    ROOT,
    'lib/images/variants.gen.ts',
  );
const GENERATOR =
  resolve(
    ROOT,
    'scripts/gen-image-variants.ts',
  );
const OPTIMIZED_IMAGE =
  resolve(
    ROOT,
    'components/ui/OptimizedImage.tsx',
  );

/**
 * Bytes of lib/images/variants.gen.ts. Measured at 15,337 B on 2026-11-17 (156
 * rows); the line is that plus about 1 KB, roughly ten more pictures.
 *
 * 2026-11-19: RAISED 16,400 -> 16,700 B (OPT-01 line in scripts/check-bundle-budget.ts). RMHCharacters' card,
 * banner and logo are three rows, the same three every listed app has; the manifest was 16,408 B with them (the
 * headroom had already gone to earlier pictures). The new line keeps about three more pictures of headroom.
 */
const MANIFEST_BYTE_BUDGET = 16_700;

/**
 * Rows one top-level folder of public/images/ may add. `games/` is the largest
 * today (113 rows: every game and app card, which the catalog pages really do draw
 * through OptimizedImage) and is grandfathered at its count; any other folder that
 * grows past this is a gallery for one page, which belongs in EXCLUDED.
 */
const FOLDER_ROW_CAP = 40;
const GRANDFATHERED_FOLDERS: Record<
  string,
  number
> =
  {
    games: 120,
  };

/** Folders excluded from the manifest because their rows would cost every page. */
const MUST_STAY_EXCLUDED =
  [
    'site-history',
  ];

function manifestRows(): string[] {
  return [
    ...readFileSync(
      MANIFEST,
      'utf8',
    ).matchAll(
      /^\s+"(\/images\/[^"]+)":/gm,
    ),
  ].map(
    (
      m,
    ) =>
      m[1] ??
      '',
  );
}

function topFolder(
  path: string,
): string {
  const rest =
    path.slice(
      '/images/'
        .length,
    );
  const slash =
    rest.indexOf(
      '/',
    );
  return slash ===
    -1
    ? '(root)'
    : rest.slice(
        0,
        slash,
      );
}

describe('image variant manifest: entry cost', () => {
  it('is a static import of OptimizedImage (the premise: its rows ship in the entry)', () => {
    const src =
      readFileSync(
        OPTIMIZED_IMAGE,
        'utf8',
      );
    expect(
      src,
      'OptimizedImage no longer imports the manifest statically; see the note at the top of this file',
    ).toMatch(
      /^import\s*\{[^}]*\}\s*from\s*'@\/lib\/images\/variants\.gen';/m,
    );
  });

  it(`stays under ${MANIFEST_BYTE_BUDGET.toLocaleString('en-US')} bytes`, () => {
    const bytes =
      statSync(
        MANIFEST,
      ).size;
    expect(
      bytes,
      `lib/images/variants.gen.ts is ${bytes} B, over its ${MANIFEST_BYTE_BUDGET} B line. Every row ships in the client ` +
        `entry. Pictures for one page go in EXCLUDED in scripts/gen-image-variants.ts and are drawn with a plain lazy ` +
        `<img>; raising this line needs an OPT-01 line in scripts/check-bundle-budget.ts naming the feature.`,
    ).toBeLessThanOrEqual(
      MANIFEST_BYTE_BUDGET,
    );
  });

  it(`no folder adds more than ${FOLDER_ROW_CAP} rows`, () => {
    const counts =
      new Map<
        string,
        number
      >();
    for (const row of manifestRows())
      counts.set(
        topFolder(
          row,
        ),
        (counts.get(
          topFolder(
            row,
          ),
        ) ??
          0) +
          1,
      );
    const over =
      [
        ...counts,
      ]
        .filter(
          ([
            folder,
            n,
          ]) =>
            n >
            (GRANDFATHERED_FOLDERS[
              folder
            ] ??
              FOLDER_ROW_CAP),
        )
        .map(
          ([
            folder,
            n,
          ]) =>
            `public/images/${folder}/: ${n} rows`,
        );
    expect(
      over,
      'A folder this large is a gallery for one page, and its rows cost every page. Add it to EXCLUDED in ' +
        'scripts/gen-image-variants.ts and draw its pictures with a plain lazy <img>.',
    ).toEqual(
      [],
    );
  });

  it('keeps the folders excluded for this reason out of the manifest', () => {
    const generator =
      readFileSync(
        GENERATOR,
        'utf8',
      );
    const excluded =
      generator.match(
        /const EXCLUDED = \[([^\]]*)\]/,
      )?.[1] ??
      '';
    const rows =
      manifestRows();
    for (const folder of MUST_STAY_EXCLUDED) {
      expect(
        excluded,
        `${folder} must stay in EXCLUDED in scripts/gen-image-variants.ts`,
      ).toContain(
        `'${folder}'`,
      );
      expect(
        rows.filter(
          (
            r,
          ) =>
            r.startsWith(
              `/images/${folder}/`,
            ),
        ),
      ).toEqual(
        [],
      );
    }
  });
});
