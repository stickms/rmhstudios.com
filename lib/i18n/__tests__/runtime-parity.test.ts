/**
 * The site's translation runtime (lib/i18n/runtime/, aliased over `i18next` and
 * `react-i18next` in every build) must answer exactly as i18next 27 does.
 *
 * A difference here does not crash anything: it is a word missing in Arabic, a
 * plural that reads wrong in Russian, a key printed where a sentence belongs.
 * So this compares the two directly:
 *
 * 1. every key of every namespace of every shipped locale, with and without a
 *    default, with and without its variables, through `ns:key`, and every plural
 *    family at counts 0, 1, 2, 3, 5, 11, 21, 1.5 and 1,000,000;
 * 2. every `t()` call in the source with literal options, in every locale;
 * 3. a table of edge cases (empty strings, missing and undefined variables,
 *    dotted and natural-language keys, `replace`, key arrays, unknown namespaces
 *    and languages, string counts).
 *
 * It also fails if a catalog, a default or a call starts using something the
 * runtime does not implement (nesting, formatters, `{{- }}`, context, ordinals,
 * `returnObjects`, `keyPrefix`), instead of letting it quietly differ.
 *
 * The non-English catalogs live on the i18n/catalogs branch (`pnpm i18n:pull`).
 * CI pulls them first (ci-checks.yml) and this fails there without them; a
 * local run without them compares English and the edge cases only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript-js';
import { describe, expect, it } from 'vitest';
import { buildInitOptions, LOCALES, NAMESPACES } from '../config';
import { createInstance as createRuntime } from '../runtime/i18next';

const ROOT = join(import.meta.dirname, '..', '..', '..');
// The real package, by file: the bare specifier resolves to the runtime under test.
const realPath = createRequire(import.meta.url).resolve('i18next');
const realI18next = (
  (await import(pathToFileURL(realPath).href)) as {
    default: {
      createInstance: () => any;
    };
  }
).default;

type Catalog = Record<string, unknown>;
const PLURAL = /_(zero|one|two|few|many|other)$/;
const COUNTS = [0, 1, 2, 3, 5, 11, 21, 1.5, 1_000_000];

function readCatalog(lng: string, ns: string): Catalog | null {
  const file = join(ROOT, 'locales', lng, `${ns}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Catalog) : null;
}
const shipped = LOCALES.filter((l) => l === 'en' || existsSync(join(ROOT, 'locales', l)));
const missing = LOCALES.filter((l) => !shipped.includes(l));

function resourcesFor(locale: string): Record<string, Record<string, Catalog>> {
  const out: Record<string, Record<string, Catalog>> = {};
  for (const lng of new Set([locale, 'en'])) {
    out[lng] = {};
    for (const ns of NAMESPACES) {
      const c = readCatalog(lng, ns);
      if (c) out[lng]![ns] = c;
    }
  }
  return out;
}

function pair(locale: string, resources: Record<string, Record<string, Catalog>>, extra: Record<string, unknown> = {}) {
  const options = {
    ...buildInitOptions(locale as never, resources),
    ...extra,
  };
  const real = realI18next.createInstance();
  void real.init(structuredClone(options));
  const ours = createRuntime() as any;
  void ours.init(structuredClone(options));
  return {
    real,
    ours,
  };
}

function varsIn(...strings: unknown[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const s of strings) {
    if (typeof s !== 'string') continue;
    for (const m of s.matchAll(/\{\{(.+?)\}\}/g)) vars[m[1]!.trim()] = `‹${m[1]!.trim()}›`;
  }
  return vars;
}

describe('catalogs use only what the runtime implements', () => {
  it('flat strings; no nesting, formatters or unescaped interpolation', () => {
    const bad: string[] = [];
    for (const lng of shipped) {
      for (const ns of NAMESPACES) {
        const c = readCatalog(lng, ns);
        if (!c) continue;
        for (const [k, v] of Object.entries(c)) {
          if (typeof v !== 'string') bad.push(`${lng}/${ns}:${k} is not a string`);
          else if (v.includes('$t(')) bad.push(`${lng}/${ns}:${k} nests $t()`);
          else if (/\{\{-/.test(v)) bad.push(`${lng}/${ns}:${k} uses {{- }}`);
          else if (/\{\{[^}]*,[^}]*\}\}/.test(v)) bad.push(`${lng}/${ns}:${k} uses a formatter`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe.each(shipped)('runtime matches i18next on every %s key', (locale) => {
  it('lookups, defaults, variables, ns:key and plurals', () => {
    const resources = resourcesFor(locale);
    const { real, ours } = pair(locale, resources);
    const diffs: string[] = [];
    const check = (label: string, key: string | string[], opts?: Record<string, unknown>) => {
      const a = real.t(key, opts);
      const b = ours.t(key, opts);
      if (a !== b && diffs.length < 25)
        diffs.push(
          `${label} ${JSON.stringify(key)} ${JSON.stringify(opts)}: i18next=${JSON.stringify(a)} runtime=${JSON.stringify(b)}`,
        );
    };
    let calls = 0;
    for (const ns of NAMESPACES) {
      const own = resources[locale]?.[ns] ?? {};
      const en = resources.en?.[ns] ?? {};
      // Each base key with the keys of its family (itself and its plural forms) in either catalog.
      const families = new Map<string, Set<string>>();
      for (const k of [...Object.keys(own), ...Object.keys(en)]) {
        const base = k.replace(PLURAL, '');
        let family = families.get(base);
        if (!family) families.set(base, (family = new Set()));
        family.add(k);
      }
      for (const [base, family] of families) {
        const forms = [...family];
        const plural = forms.some((f) => PLURAL.test(f));
        const vars = varsIn(...forms.map((f) => own[f]), ...forms.map((f) => en[f]));
        check('plain', base, {
          ns,
        });
        check('default', base, {
          ns,
          defaultValue: 'DEFAULT',
        });
        check('vars', base, {
          ns,
          defaultValue: 'DEFAULT',
          ...vars,
        });
        check('ns:key', `${ns}:${base}`, {
          defaultValue: 'DEFAULT',
          ...vars,
        });
        calls += 4;
        if (plural) {
          for (const count of COUNTS) {
            check('plural', base, {
              ns,
              count,
              ...vars,
            });
            check('plural+defaults', base, {
              ns,
              count,
              ...vars,
              defaultValue_one: 'one {{count}}',
              defaultValue_other: 'other {{count}}',
            });
            calls += 2;
          }
        }
      }
    }
    expect(calls).toBeGreaterThan(1000);
    expect(diffs).toEqual([]);
  }, 120_000);
});

it.skipIf(missing.length === 0)(`non-English catalogs are on disk (missing: ${missing.join(', ')})`, () => {
  // Locally, `pnpm i18n:pull` brings them in; CI pulls them before the suite.
  expect(process.env.CI ? missing : []).toEqual([]);
});

// ── every t() call in the source ───────────────────────────────────────────
const SUPPORTED_OPTIONS = new Set(['defaultValue', 'count', 'ns', 'replace', 'lng']);
const UNSUPPORTED_OPTIONS = new Set([
  'context',
  'ordinal',
  'returnObjects',
  'returnDetails',
  'joinArrays',
  'keyPrefix',
  'lngs',
  'fallbackLng',
  'postProcess',
  'interpolation',
  'skipInterpolation',
  'nsSeparator',
  'keySeparator',
  'defaultValue_ordinal',
]);
interface Call {
  file: string;
  key: string;
  ns: string | undefined;
  opts: Record<string, unknown>;
  countVar: boolean;
}

function collectCalls(): {
  calls: Call[];
  unsupported: string[];
  defaults: string[];
} {
  const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (f) =>
        f &&
        !f.includes('.test.') &&
        !f.startsWith('scripts/') &&
        !f.endsWith('.d.ts') &&
        !f.startsWith('lib/i18n/runtime/'),
    );
  const calls: Call[] = [];
  const unsupported: string[] = [];
  const defaults: string[] = [];
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    if (!src.includes('t(')) continue;
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      false,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const fileNs = [...src.matchAll(/useTranslation\(\s*\[?\s*['"]([\w-]+)['"]/g)].map((m) => m[1]!);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
        const [k, o] = n.arguments;
        if (
          name === 't' &&
          k &&
          (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) &&
          o &&
          ts.isObjectLiteralExpression(o)
        ) {
          const opts: Record<string, unknown> = {};
          let literal = true;
          let countVar = false;
          for (const p of o.properties) {
            if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) {
              literal = false;
              continue;
            }
            const pn = p.name.getText(sf).replace(/^['"]|['"]$/g, '');
            if (UNSUPPORTED_OPTIONS.has(pn) || pn.startsWith('defaultValue_ordinal'))
              unsupported.push(`${file}: t('${k.text}', { ${pn} })`);
            const init = ts.isPropertyAssignment(p) ? p.initializer : undefined;
            if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
              opts[pn] = init.text;
              if (pn.startsWith('defaultValue')) defaults.push(init.text);
            } else if (init && ts.isNumericLiteral(init)) opts[pn] = Number(init.text);
            else if (pn === 'count') countVar = true;
            else if (pn === 'ns' || pn === 'lng' || pn === 'replace') literal = false;
            else opts[pn] = `‹${pn}›`;
          }
          if (literal)
            calls.push({
              file,
              key: k.text,
              ns: (opts.ns as string | undefined) ?? fileNs[0],
              opts,
              countVar,
            });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return {
    calls,
    unsupported,
    defaults,
  };
}

describe('every t() call in the source', () => {
  const { calls, unsupported, defaults } = collectCalls();

  it('uses only options the runtime implements', () => {
    expect(unsupported).toEqual([]);
    for (const name of SUPPORTED_OPTIONS) expect(UNSUPPORTED_OPTIONS.has(name)).toBe(false);
  });

  it('has no default that nests, formats or unescapes', () => {
    expect(defaults.filter((d) => d.includes('$t(') || /\{\{-/.test(d) || /\{\{[^}]*,[^}]*\}\}/.test(d))).toEqual([]);
  });

  it.each(shipped)(
    'answers the same in %s',
    (locale) => {
      expect(calls.length).toBeGreaterThan(10_000);
      const { real, ours } = pair(locale, resourcesFor(locale));
      // Production English: no catalog at all, everything from defaults.
      const bare = locale === 'en' ? pair('en', {}) : undefined;
      const diffs: string[] = [];
      for (const c of calls) {
        const counts = c.countVar ? COUNTS : [undefined];
        for (const count of counts) {
          const opts = {
            ...c.opts,
            ...(c.ns && !c.opts.ns
              ? {
                  ns: c.ns,
                }
              : {}),
            ...(count === undefined
              ? {}
              : {
                  count,
                }),
          };
          for (const [x, y] of bare
            ? [
                [real, ours],
                [bare.real, bare.ours],
              ]
            : [[real, ours]]) {
            const a = x.t(c.key, opts);
            const b = y.t(c.key, opts);
            if (a !== b && diffs.length < 25)
              diffs.push(
                `${c.file} t(${JSON.stringify(c.key)}, ${JSON.stringify(opts)}): i18next=${JSON.stringify(a)} runtime=${JSON.stringify(b)}`,
              );
          }
        }
      }
      expect(diffs).toEqual([]);
    },
    120_000,
  );
});

// ── edge cases ─────────────────────────────────────────────────────────────
describe('edge cases', () => {
  const resources = {
    en: {
      common: {
        hello: 'Hello {{name}}',
        empty: '',
        'dotted.key': 'Dotted',
        'Natural language: key': 'Natural',
        item_one: '{{count}} item',
        item_other: '{{count}} items',
        onlyOther_other: 'other only',
        zeroish_zero: 'none',
        zeroish_one: 'one',
        zeroish_other: 'many',
        nested: 'User {{user.name}} has {{user.stats.posts}}',
        twice: '{{a}} and {{a}} and {{b}}',
        braces: '{{{x}}} {{ y }}',
        html: '<b>{{v}}</b>',
        __proto__x: 'proto-ish',
      },
      other: {
        thing: 'Other thing',
        item_one: 'other one',
        item_other: 'other many',
      },
    },
    ar: {
      common: {
        hello: 'مرحبا {{name}}',
        item_zero: 'صفر',
        item_one: 'واحد',
        item_two: 'اثنان',
        item_few: '{{count}} قليل',
        item_many: '{{count}} كثير',
        item_other: '{{count}} آخر',
        empty: '',
      },
    },
    ru: {
      common: {
        item_one: '{{count}} штука',
        item_few: '{{count}} штуки',
        item_other: '{{count}} штук',
      },
    },
    fr: {
      common: {
        item_one: '{{count}} chose',
      },
    },
  };
  const cases: [unknown, unknown?][] = [
    [
      'hello',
      {
        name: 'Ana',
      },
    ],
    ['hello'],
    [
      'hello',
      {
        name: undefined,
      },
    ],
    [
      'hello',
      {
        name: null,
      },
    ],
    [
      'hello',
      {
        name: 0,
      },
    ],
    [
      'hello',
      {
        name: {
          toString: () => 'obj',
        },
      },
    ],
    [
      'hello',
      {
        replace: {
          name: 'R',
        },
      },
    ],
    ['hello', 'string default'],
    ['missing', 'string default {{x}}'],
    [
      'missing',
      {
        defaultValue: '',
      },
    ],
    [
      'missing',
      {
        defaultValue: 'D {{name}}',
        name: 'N',
      },
    ],
    ['missing'],
    ['empty'],
    [
      'empty',
      {
        defaultValue: 'fallback',
      },
    ],
    ['dotted.key'],
    ['Natural language: key'],
    ['other:thing'],
    [
      'other:missing',
      {
        defaultValue: 'd',
      },
    ],
    ['nope:thing'],
    [
      'thing',
      {
        ns: 'other',
      },
    ],
    [
      'thing',
      {
        ns: ['common', 'other'],
      },
    ],
    [
      ['missing', 'hello'],
      {
        name: 'arr',
      },
    ],
    [
      'item',
      {
        count: '3',
      },
    ],
    [
      'onlyOther',
      {
        count: 1,
      },
    ],
    [
      'onlyOther',
      {
        count: 7,
      },
    ],
    [
      'zeroish',
      {
        count: 0,
      },
    ],
    [
      'zeroish',
      {
        count: 0,
        defaultValue_zero: 'dz',
      },
    ],
    [
      'missing',
      {
        count: 0,
        defaultValue_zero: 'dz',
        defaultValue_other: 'do',
      },
    ],
    [
      'missing',
      {
        count: 1,
        defaultValue_one: 'do1',
        defaultValue: 'd',
      },
    ],
    [
      'missing',
      {
        count: 2,
        defaultValue_one: 'do1',
      },
    ],
    [
      'missing',
      {
        count: 2,
        defaultValue_one: 'do1',
        defaultValue_other: '',
      },
    ],
    [
      'nested',
      {
        user: {
          name: 'U',
          stats: {
            posts: 3,
          },
        },
      },
    ],
    [
      'nested',
      {
        'user.name': 'flat',
      },
    ],
    [
      'twice',
      {
        a: 'A',
      },
    ],
    [
      'braces',
      {
        x: 'X',
        y: 'Y',
      },
    ],
    [
      'html',
      {
        v: '<i>&"\'</i>',
      },
    ],
    ['__proto__'],
    ['constructor'],
    ['toString'],
    [''],
    [null],
    [
      'other:item',
      {
        count: 1,
      },
    ],
  ];
  const langs = ['en', 'ar', 'ru', 'fr', 'zh', 'xx'];
  it.each(langs)('answers the same in %s', (lng) => {
    const diffs: string[] = [];
    for (const extra of [
      {},
      {
        interpolation: {
          escapeValue: true,
        },
      },
      {
        supportedLngs: false,
        fallbackLng: 'en',
      },
    ]) {
      const { real, ours } = pair(lng, structuredClone(resources), extra);
      for (const [key, opts] of cases) {
        for (const count of [undefined, 0, 1, 2, 5]) {
          const o =
            opts === undefined
              ? count === undefined
                ? undefined
                : {
                    count,
                  }
              : typeof opts === 'object' && count !== undefined && !('count' in (opts as object))
                ? {
                    ...(opts as object),
                    count,
                  }
                : opts;
          const a = real.t(key, o);
          const b = ours.t(key, o);
          if (a !== b)
            diffs.push(
              `${JSON.stringify(extra)} t(${JSON.stringify(key)}, ${JSON.stringify(o)}): i18next=${JSON.stringify(a)} runtime=${JSON.stringify(b)}`,
            );
        }
      }
      const fixedReal = real.getFixedT(lng, 'other');
      const fixedOurs = ours.getFixedT(lng, 'other');
      for (const k of ['thing', 'common:hello', 'item']) {
        for (const o of [
          undefined,
          {
            count: 1,
          },
          {
            count: 4,
          },
          {
            ns: 'common',
          },
        ]) {
          if (fixedReal(k, o) !== fixedOurs(k, o))
            diffs.push(`fixedT ${k} ${JSON.stringify(o)}: ${fixedReal(k, o)} vs ${fixedOurs(k, o)}`);
        }
      }
      for (const p of ['language', 'resolvedLanguage', 'isInitialized']) {
        if (real[p] !== ours[p]) diffs.push(`${p}: ${real[p]} vs ${ours[p]}`);
      }
      if (JSON.stringify(real.languages) !== JSON.stringify(ours.languages))
        diffs.push(`languages: ${real.languages} vs ${ours.languages}`);
    }
    expect(diffs).toEqual([]);
  });

  it('t before init answers the empty string', () => {
    expect(
      (createRuntime() as any).t('x', {
        defaultValue: 'd',
      }),
    ).toBe(
      realI18next.createInstance().t('x', {
        defaultValue: 'd',
      }),
    );
  });

  it('a postProcessor runs on every answer', () => {
    const { real, ours } = pair('en', structuredClone(resources));
    for (const i of [real, ours]) {
      i.use({
        type: 'postProcessor',
        name: 'up',
        process: (v: string) => v.toUpperCase(),
      });
      i.options.postProcess = ['up'];
    }
    for (const [k, o] of cases.slice(0, 12)) expect(ours.t(k, o)).toBe(real.t(k, o));
  });
});

describe('loading through a backend', () => {
  const catalogs: Record<string, Record<string, Catalog>> = {
    en: {
      a: {
        x: 'en x',
      },
      b: {
        y: 'en y',
      },
    },
    ar: {
      a: {
        x: 'ar x',
      },
    },
  };
  const backend = (log: string[]) => ({
    type: 'backend' as const,
    init() {},
    read(lng: string, ns: string, cb: (e: unknown, d: Catalog | null) => void) {
      log.push(`${lng}|${ns}`);
      setTimeout(() => (lng === 'fr' ? cb(new Error('nope'), null) : cb(null, catalogs[lng]?.[ns] ?? {})), 1);
    },
  });
  const options = (lng: string) => ({
    lng,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar', 'fr'],
    ns: [],
    defaultNS: 'a',
    partialBundledLanguages: true,
    resources: {},
    interpolation: {
      escapeValue: false,
    },
  });

  it('loads the same pairs, fires the same events and ends in the same state', async () => {
    const run = async (make: () => any) => {
      const log: string[] = [];
      const events: string[] = [];
      const i = make();
      i.use(backend(log));
      for (const e of ['languageChanged', 'loaded', 'failedLoading'])
        i.on(e, (...args: unknown[]) => events.push(`${e}:${JSON.stringify(args[0])}`));
      // `initialized` carries the whole options object, which nothing reads: compare that it fires.
      i.on('initialized', () => events.push('initialized'));
      await i.init(options('ar'));
      const before = [
        i.hasLoadedNamespace('a'),
        i.t('x', {
          ns: 'a',
        }),
      ];
      await i.loadNamespaces(['a', 'b']);
      const after = [
        i.hasLoadedNamespace('a'),
        i.hasLoadedNamespace('b'),
        i.t('x', {
          ns: 'a',
        }),
        i.t('y', {
          ns: 'b',
        }),
      ];
      await i.changeLanguage('fr');
      const fr = [
        i.language,
        i.hasLoadedNamespace('a'),
        i.t('x', {
          ns: 'a',
        }),
      ];
      await i.changeLanguage('ar');
      return {
        log: log.sort(),
        events,
        before,
        after,
        fr,
        ns: i.options.ns,
        lng: i.language,
      };
    };
    expect(await run(() => createRuntime())).toEqual(await run(() => realI18next.createInstance()));
  });
});
