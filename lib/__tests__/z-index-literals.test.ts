/**
 * Raw global-layer `z-index` numbers in site-tier CSS (redesign audit E2 follow-up).
 *
 * `app/globals.css` §5.6 names the layers (`--z-*`). A stylesheet that needs a layer reads the token
 * (`z-index: var(--z-dialog)`); one that writes `z-index: 50` has re-invented a number that happens
 * to work today and that the scale can no longer reorder. Values below 10 (`1`, `2`, `-1`, …) are
 * LOCAL ordering inside one component's own stacking context and are not layers — they stay literal.
 *
 * Scope is the site tier, exactly what `eslint-local-rules/design-scope.js` `isSiteTier` covers;
 * games and `--app-*` apps keep their own scheme.
 *
 * `LOCAL_BANDS` is the allowlist: values >= 10 that were audited and are intra-component bands
 * (sticky bars, card hover lift, popups inside one panel) or whose mount point is not yet verified.
 * It only shrinks — an entry that no longer matches fails, and a new offender is not added here, it
 * reads (or adds) a `--z-*` token.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { isSiteTier } from '../../eslint-local-rules/design-scope.js';

const ROOT =
  process.cwd();
const MIN_LAYER = 10;

function siteCssFiles(): string[] {
  return execSync(
    "git ls-files '*.css'",
    {
      cwd: ROOT,
    },
  )
    .toString()
    .trim()
    .split(
      '\n',
    )
    .filter(
      (
        f,
      ) => {
        const [
          top,
          second,
        ] =
          f.split(
            '/',
          );
        if (
          top ===
          'components'
        )
          return isSiteTier(
            f,
          );
        return (
          top ===
            'app' &&
          second !==
            'routes'
        );
      },
    );
}

/** `file :: selector :: value` for every literal z-index with |value| >= MIN_LAYER. */
function offenders(): string[] {
  const out: string[] =
    [];
  for (const f of siteCssFiles()) {
    const src =
      readFileSync(
        `${ROOT}/${f}`,
        'utf8',
      ).replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );
    for (const m of src.matchAll(
      /([^{}]+)\{([^{}]*)\}/g,
    )) {
      const z =
        /(?:^|[;\s])z-index:\s*(-?\d+)\s*(?:;|$)/.exec(
          m[2] ??
            '',
        );
      if (
        z &&
        Math.abs(
          Number(
            z[1],
          ),
        ) >=
          MIN_LAYER
      ) {
        out.push(
          `${f} :: ${(m[1] ?? '').trim().replace(/\s+/g, ' ')} :: ${z[1]}`,
        );
      }
    }
  }
  return out;
}

/** Audited intra-component bands. Entries come out of this list; they do not go in. */
const LOCAL_BANDS =
  [
    'app/globals/components-reveal.css :: .spatial-design-nav :: 30',
    'components/library/library/catalog-reader.css :: .lib-book:hover,\n.lib-book:focus-within,\n.lib-coll-tile:hover,\n.lib-coll-tile:focus-within :: 20',
    'components/library/library/catalog-reader.css :: .lib-book__name :: 21',
    'components/library/library/catalog-reader.css :: .lib-reader__chapters-menu :: 20',
    'components/library/library/sections-refresh.css :: .lib-reader__bar :: 15',
    'components/library/library/sections-refresh.css :: .lib-reader__details-overlay :: 39',
    'components/library/library/sections-refresh.css :: .lib-reader__details :: 40',
    'components/library/library/sections-refresh.css :: .lib-explorer :: 35',
    'components/reading/reading.css :: .rf-pop :: 70',
    'components/reading/reading.css :: .rf-seltool :: 70',
    'components/reading/reading.css :: .rf-ruler :: 60',
    'components/reading/reading.css :: .rf-textview :: 40',
    'components/rmhtech/rmhtech.css :: .rmht header :: 10',
  ].map(
    (
      e,
    ) =>
      e.replace(
        /\n/g,
        ' ',
      ),
  );

describe('E2 — site-tier CSS names its global z layers', () => {
  it('scans a non-trivial set of site-tier stylesheets', () => {
    expect(
      siteCssFiles()
        .length,
    ).toBeGreaterThan(
      20,
    );
  });

  it('no new raw z-index >= 10; read a --z-* token instead', () => {
    const fresh =
      offenders().filter(
        (
          o,
        ) =>
          !LOCAL_BANDS.includes(
            o,
          ),
      );
    expect(
      fresh,
      'A literal z-index >= 10 is a layer: use `var(--z-*)` (add a token in globals.css §5.6 if none fits).',
    ).toEqual(
      [],
    );
  });

  it('every allowlisted band still exists (the list only shrinks)', () => {
    const live =
      new Set(
        offenders(),
      );
    const stale =
      LOCAL_BANDS.filter(
        (
          b,
        ) =>
          !live.has(
            b,
          ),
      );
    expect(
      stale,
      'Remove these entries — the literal is gone.',
    ).toEqual(
      [],
    );
  });
});
