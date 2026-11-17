import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  LOCALES,
  NAMESPACES,
  CORE_NAMESPACES,
  PENDING_LOCALES,
} from '@/lib/i18n/config';

function pathFor(
  locale: string,
  ns: string,
): string {
  return join(
    process.cwd(),
    'locales',
    locale,
    `${ns}.json`,
  );
}
function load(
  locale: string,
  ns: string,
): Record<
  string,
  string
> {
  return JSON.parse(
    readFileSync(
      pathFor(
        locale,
        ns,
      ),
      'utf8',
    ),
  );
}

// ─── Plural categories ──────────────────────────────────────────────────────
//
// i18next suffixes plural keys with a CLDR plural category (`count_one`,
// `count_other`, …), and *which* categories exist is a property of the
// language, not of the string. English has two (one, other); Chinese and
// Japanese have one (other); Russian and Polish have four; Arabic has six.
//
// So a raw key-set comparison against English is wrong in both directions: ru
// legitimately carries `_few`/`_many` that English lacks, and zh legitimately
// lacks the `_one` that English has. The categories are checked per language
// (below), against the plural groups English declares.

const PLURAL_CATEGORIES =
  [
    'zero',
    'one',
    'two',
    'few',
    'many',
    'other',
  ] as const;

function splitPlural(
  key: string,
): {
  base: string;
  category: string;
} | null {
  const i =
    key.lastIndexOf(
      '_',
    );
  if (
    i <=
    0
  )
    return null;
  const category =
    key.slice(
      i +
        1,
    );
  return (
    PLURAL_CATEGORIES as readonly string[]
  ).includes(
    category,
  )
    ? {
        base: key.slice(
          0,
          i,
        ),
        category,
      }
    : null;
}

/** Base keys English declares as plural groups — the authority for what counts
 *  as a plural suffix, so a non-plural key merely ending in `_one` is safe. */
function pluralBases(
  englishKeys: string[],
): Set<string> {
  const bases =
    new Set<string>();
  for (const k of englishKeys) {
    const p =
      splitPlural(
        k,
      );
    if (
      p
    )
      bases.add(
        p.base,
      );
  }
  return bases;
}

/** The plural categories a language actually requires, per CLDR. */
function requiredCategories(
  locale: string,
): string[] {
  return [
    ...new Intl.PluralRules(
      locale,
    ).resolvedOptions()
      .pluralCategories,
  ].sort();
}

// There is no allowlist of untranslated keys. The non-English catalogs live on
// the i18n/catalogs branch and lag English by design: a key English gained since
// the last translate run falls back to English per key, and one English lost is
// pruned by the next run (scripts/translate-locales.ts). So a pull request that
// changes English never has to touch, or wait for, another locale.

// ─── Registry parity ────────────────────────────────────────────────────────
//
// The checks below guard the two silent failures that catalog *content* tests
// structurally cannot see, because both make a file invisible rather than wrong:
//
//   1. A namespace file that is not in NAMESPACES is never loaded. i18next
//      serves the `defaultValue` from each t() call instead, so English renders
//      correctly and every other locale renders English. Nothing throws.
//   2. A locale directory that is not in LOCALES is translated by the pipeline
//      and served to nobody.
//
// Both had actually happened when these were written: 18 namespaces (every one
// of them a shipped feature — awards, circle, creator, history, lists,
// predictions, saves, tournaments, wager, wishlists, theme studio, three
// settings pages) and 16 locale directories.
describe('registry parity', () => {
  const localesDir =
    join(
      process.cwd(),
      'locales',
    );

  it('NAMESPACES matches locales/en/ exactly', () => {
    const files =
      readdirSync(
        join(
          localesDir,
          'en',
        ),
      )
        .filter(
          (
            f,
          ) =>
            f.endsWith(
              '.json',
            ),
        )
        .map(
          (
            f,
          ) =>
            f.replace(
              /\.json$/,
              '',
            ),
        )
        .sort();
    const registered: string[] =
      [
        ...NAMESPACES,
      ].sort();

    // Unregistered: the file exists, ships in every locale, and is dead weight.
    expect(
      files.filter(
        (
          f,
        ) =>
          !registered.includes(
            f,
          ),
      ),
    ).toEqual(
      [],
    );
    // Unbacked: registered but no English source — i18next requests a 404 chunk.
    expect(
      registered.filter(
        (
          n,
        ) =>
          !files.includes(
            n,
          ),
      ),
    ).toEqual(
      [],
    );
  });

  it('every locales/ directory is either shipped or explicitly pending', () => {
    const dirs =
      readdirSync(
        localesDir,
      )
        .filter(
          (
            d,
          ) =>
            statSync(
              join(
                localesDir,
                d,
              ),
            ).isDirectory(),
        )
        .sort();
    const known =
      [
        ...LOCALES,
        ...PENDING_LOCALES,
      ] as readonly string[];
    expect(
      dirs.filter(
        (
          d,
        ) =>
          !known.includes(
            d,
          ),
      ),
    ).toEqual(
      [],
    );
  });

  it('no locale is both shipped and pending', () => {
    const shipped =
      LOCALES as readonly string[];
    expect(
      PENDING_LOCALES.filter(
        (
          l,
        ) =>
          shipped.includes(
            l,
          ),
      ),
    ).toEqual(
      [],
    );
  });

  it('CORE_NAMESPACES is a subset of NAMESPACES', () => {
    const registered =
      NAMESPACES as readonly string[];
    expect(
      CORE_NAMESPACES.filter(
        (
          ns,
        ) =>
          !registered.includes(
            ns,
          ),
      ),
    ).toEqual(
      [],
    );
  });
});

describe('catalog integrity', () => {
  // Without `pnpm i18n:pull` only English is on disk and the per-locale checks
  // below have nothing to read; that is a valid state (every key falls back to
  // English). Catalogs that ARE present came from the i18n/catalogs branch, and
  // the pull records which commit, so a stray hand-copied directory shows up.
  it('non-English catalogs on disk came from `pnpm i18n:pull`', () => {
    const dir =
      join(
        process.cwd(),
        'locales',
      );
    const others =
      readdirSync(
        dir,
      ).filter(
        (
          d,
        ) =>
          d !==
            'en' &&
          statSync(
            join(
              dir,
              d,
            ),
          ).isDirectory(),
      );
    if (
      others.length >
      0
    )
      expect(
        existsSync(
          join(
            dir,
            '.catalogs-commit',
          ),
        ),
      ).toBe(
        true,
      );
  });

  // Namespaces a locale has not started translating are simply absent and fall
  // back to English per key, so they are skipped here.
  for (const ns of NAMESPACES) {
    const enKeys =
      Object.keys(
        load(
          'en',
          ns,
        ),
      );
    const bases =
      pluralBases(
        enKeys,
      );
    for (const locale of LOCALES) {
      if (
        locale ===
        'en'
      )
        continue;
      if (
        !existsSync(
          pathFor(
            locale,
            ns,
          ),
        )
      )
        continue;

      // Every plural group a locale has translated must carry exactly the
      // categories its language requires — no more (dead keys i18next can never select) and no fewer
      // (the count falls back to English mid-sentence).
      it(`${locale}/${ns} uses the CLDR plural categories for its language`, () => {
        const required =
          requiredCategories(
            locale,
          );
        const byBase =
          new Map<
            string,
            string[]
          >();
        for (const key of Object.keys(
          load(
            locale,
            ns,
          ),
        )) {
          const p =
            splitPlural(
              key,
            );
          if (
            !p ||
            !bases.has(
              p.base,
            )
          )
            continue;
          byBase.set(
            p.base,
            [
              ...(byBase.get(
                p.base,
              ) ??
                []),
              p.category,
            ],
          );
        }
        const wrong =
          [
            ...byBase.entries(),
          ]
            .map(
              ([
                base,
                cats,
              ]) => ({
                base,
                got: [
                  ...cats,
                ].sort(),
              }),
            )
            .filter(
              ({
                got,
              }) =>
                got.join(
                  ',',
                ) !==
                required.join(
                  ',',
                ),
            );
        expect(
          wrong,
        ).toEqual(
          [],
        );
      });
    }
  }

  // Every locale that has STARTED translating must provide the FULL core set
  // (so a partial catalog can't silently ship). A brand-new locale with no core
  // files yet is skipped — it falls back to English until its catalog exists.
  for (const locale of LOCALES) {
    if (
      locale ===
      'en'
    )
      continue;
    const started =
      CORE_NAMESPACES.some(
        (
          ns,
        ) =>
          existsSync(
            pathFor(
              locale,
              ns,
            ),
          ),
      );
    if (
      !started
    )
      continue;
    for (const ns of CORE_NAMESPACES) {
      it(`${locale} provides core namespace ${ns}`, () => {
        expect(
          existsSync(
            pathFor(
              locale,
              ns,
            ),
          ),
        ).toBe(
          true,
        );
      });
    }
  }
});
