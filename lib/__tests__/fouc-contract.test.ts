import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { collectRoutes, parseRouteTree } from '../../testing/e2e/fouc-routes.mjs';

/**
 * The FOUC contract — the half of `testing/e2e/fouc.mjs` that does not need a
 * browser.
 *
 * The runtime audit is the authority: it drives the built site in Chromium and
 * measures what the document looked like frame by frame. But it needs a build and
 * a server, so it runs before a release and not before every commit — and a FOUC
 * regression lands in a commit. This file is the part of the same audit that can
 * be proved from the source alone, so it runs in `pnpm test` and in the commit
 * gate, and it fails on the two mistakes that produced every flash the audit
 * found:
 *
 *  1. A root-level visual decision applied only AFTER hydration. The whole
 *     pre-paint script stack in `app/routes/__root.tsx` exists because a class or
 *     token written on `<html>` from a `useEffect` restyles a document the reader
 *     is already looking at. `html.app-route` was written that way and every game
 *     and full-screen app loaded with the site's translucent surfaces, a reserved
 *     scrollbar gutter and a live aurora, then snapped out of all three.
 *  2. A page nobody audited. Coverage is derived from `app/routeTree.gen.ts`, so a
 *     new route is in the audit the moment it exists — unless it needs a URL
 *     parameter, in which case this gate makes someone say what to request.
 *
 * Neither check is a substitute for running the audit. Both are what stops the
 * audit's result from quietly expiring.
 */

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/**
 * The inline scripts in `__root.tsx` that run before first paint, as one string.
 *
 * Everything between `const themeScript = \`` and the end of the `head()` scripts
 * array is pre-paint: `platformScript`, `PERF_TIER_SCRIPT`, `themeScript`,
 * `localeScript` and `bodyThemeScript`. The gate below asks whether a given class
 * or attribute name appears anywhere in that text, which is deliberately loose —
 * it proves the pre-paint stack KNOWS about the token, and leaves whether it
 * resolves it correctly to the runtime audit, which can actually see the pixels.
 */
function prePaintScriptText(): string {
  const root = read('app/routes/__root.tsx');
  const perfTier = read('lib/perf-tier.ts');
  return `${root}\n${perfTier}`;
}

describe('FOUC contract: pre-paint parity', () => {
  /**
   * Every root-level visual token written from client code, with where it is
   * written. A token here that the pre-paint stack does not also write is a
   * document that restyles after hydration.
   *
   * Collected by scanning rather than listed, because a list is what failed: the
   * `app-route` toggle sat in `Providers.tsx` for as long as the class existed and
   * no list anywhere said it had to be stamped early too.
   */
  const CLIENT_SOURCES = [
    'components/Providers.tsx',
    'stores/themeStore.ts',
    'lib/appearance/prefs.ts',
    'lib/perf-tier.ts',
  ];

  /**
   * Tokens that are deliberately transient — they exist only during an
   * interaction and are gone before the next paint the reader waits on, so there
   * is nothing for a pre-paint script to restore. Entries come out of this list,
   * they do not go in: anything that survives a navigation is a preference, and a
   * preference has to be stamped early.
   */
  const TRANSIENT = new Set([
    // Set for the duration of a View Transition and removed when it finishes
    // (`lib/view-transition.ts`). There is no persisted state behind it.
    'vt-active',
    'vt-liquid',
  ]);

  function rootWrites(source: string, file: string) {
    const writes: { token: string; kind: string; file: string }[] = [];

    // `html.classList.add('x')` / `.toggle('x', cond)` — on documentElement or on
    // a local alias of it (`const html = document.documentElement`). A template
    // literal (`style-${activeStyle}`) contributes its stable prefix, which is
    // the part a pre-paint script has to know about; the suffix comes from the
    // theme catalog and is checked by `theme-tokens.test.ts`.
    for (const m of source.matchAll(
      /(?:documentElement|\bhtml|\broot)\s*\.classList\s*\.\s*(?:add|toggle)\(\s*[`'"]([^`'"]+)[`'"]/g,
    )) {
      const raw = m[1];
      const interpolated = raw.indexOf('${');
      if (interpolated === -1) {
        writes.push({ token: raw, kind: 'class', file });
      } else {
        writes.push({ token: raw.slice(0, interpolated), kind: 'class prefix', file });
      }
    }
    for (const m of source.matchAll(
      /(?:documentElement|\bhtml|\broot)\s*\.setAttribute\(\s*['"](data-[a-z-]+)['"]/g,
    )) {
      writes.push({ token: m[1], kind: 'attribute', file });
    }
    for (const m of source.matchAll(
      /(?:documentElement|\bhtml|\broot)\s*\.style\s*\.setProperty\(\s*['"](--[a-z-]+)['"]/g,
    )) {
      writes.push({ token: m[1], kind: 'custom property', file });
    }
    return writes;
  }

  it('every root-level visual token written after hydration is also written before first paint', () => {
    const prePaint = prePaintScriptText();
    const offenders: string[] = [];

    for (const file of CLIENT_SOURCES) {
      for (const write of rootWrites(read(file), file)) {
        if (TRANSIENT.has(write.token)) continue;
        if (prePaint.includes(write.token)) continue;
        offenders.push(
          `${write.file}: ${write.kind} "${write.token}" is applied to <html> from client code but never by the pre-paint scripts in app/routes/__root.tsx — a hard load paints without it and then restyles.`,
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * The pre-paint script and its TypeScript mirror have to agree about which
   * routes are app-tier, because the script picks the ground from that answer and
   * `Providers` picks the surfaces from it. They are two implementations of one
   * rule (ES5 in the script because it runs before any bundle), so the gate checks
   * that neither grew an input the other does not have.
   */
  it('the pre-paint script and isAppThemeRoute read the same inputs', () => {
    const root = read('app/routes/__root.tsx');
    const providers = read('components/Providers.tsx');

    // Both must consult the exclusion list AND the exception list; a script that
    // forgot the exceptions claimed `/studio/themes` for the app tier.
    expect(root).toContain('THEME_EXCLUDED_ROUTES');
    expect(root).toContain('THEME_EXCLUDED_EXCEPTIONS');
    expect(providers).toContain('THEME_EXCLUDED_EXCEPTIONS');

    // And both must produce `app-route`: the script before paint, the effect for
    // client navigations.
    expect(root, 'themeScript must stamp html.app-route before first paint').toMatch(
      /classList\.add\("app-route"\)/,
    );
    expect(providers, 'Providers must keep toggling app-route for client navigations').toMatch(
      /classList\.toggle\('app-route'/,
    );
  });

  /**
   * Anything that paints the DOCUMENT GROUND must be registered in
   * `APP_ROUTE_THEME_BG`, so the pre-paint script paints the same colour first.
   *
   * This is the general form of the rule the `app-route` and Temple of Joy bugs
   * both broke, and it is scanned across the whole tree rather than a list of
   * known files — which is the point. The first gate above only watched the four
   * shared appearance modules, and Temple of Joy's flash was in a per-game hook
   * (`components/temple-of-joy/hooks.ts`), nowhere near them: it set
   * `documentElement.style.backgroundColor` to its own cream ground from a
   * `useEffect`, so every load painted `APP_THEME_BG` near-black and then flipped
   * to cream. A full-viewport flash, measured at Δluma 0.945.
   *
   * The ground is the largest surface on the screen, so a writer of it is always
   * either (a) a pre-paint script, (b) the one shared helper the pre-paint script
   * and the runtime both call, or (c) a page whose ground the pre-paint script
   * knows about. There is no fourth case, and this test is the list of (a) and (b).
   */
  it('every writer of the document ground is pre-paint, shared, or a registered app route', () => {
    const GROUND_WRITE =
      /document\s*\.documentElement\s*\.style\s*\.backgroundColor\s*=|\bhtml\s*\.style\s*\.backgroundColor\s*=/;

    /**
     * The sanctioned writers.
     *
     * - `app/routes/__root.tsx` — the pre-paint `themeScript` itself, plus
     *   `bodyThemeScript`. This is (a).
     * - `stores/themeStore.ts` — `applyGround`, the single helper both the
     *   post-hydration runtime and a page's own light/dark switch call, so the two
     *   cannot drift. This is (b).
     */
    const SANCTIONED = new Set(['app/routes/__root.tsx', 'stores/themeStore.ts']);

    /** Route prefixes the pre-paint script already paints correctly. */
    const registered = (() => {
      const themeStore = read('stores/themeStore.ts');
      const block = themeStore.slice(
        themeStore.indexOf('export const APP_ROUTE_THEME_BG'),
        themeStore.indexOf('export function appRouteGround'),
      );
      return [...block.matchAll(/'(\/[a-z0-9-]+)':\s*\{/g)].map((m) => m[1]);
    })();
    expect(registered.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of grepRepoMatching(GROUND_WRITE)) {
      if (SANCTIONED.has(file)) continue;
      // A per-page writer is fine as long as the pre-paint script paints the same
      // ground first. The page is identified by the directory the file sits in,
      // which is how this repo names a full-screen experience's code
      // (`components/temple-of-joy/**` ↔ `/temple-of-joy`).
      const slug = file.split('/')[1];
      if (slug && registered.includes(`/${slug}`)) continue;
      offenders.push(
        `${file} writes the document background but no APP_ROUTE_THEME_BG entry covers it — a hard load paints APP_THEME_BG first and then flips to this colour in front of the reader. Add the route to APP_ROUTE_THEME_BG in stores/themeStore.ts (and remember the ES5 mirror in app/routes/__root.tsx).`,
      );
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * `APP_ROUTE_THEME_BG` is how the pre-paint script learns that a full-screen
   * page's ground is not the near-black `APP_THEME_BG`. An entry whose
   * localStorage key no longer matches what the page persists resolves to the
   * default and the page flashes — silently, because the lookup is wrapped in a
   * `try`. The keys are therefore pinned to the pages that write them.
   */
  it('every APP_ROUTE_THEME_BG entry names a storage key the page actually persists', () => {
    const themeStore = read('stores/themeStore.ts');
    const block = themeStore.slice(
      themeStore.indexOf('export const APP_ROUTE_THEME_BG'),
      themeStore.indexOf('export function appRouteGround'),
    );
    const keys = [...block.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);

    // Each key must appear somewhere in the page's own source — either as a
    // zustand `persist` name or a direct localStorage write. `system: true`
    // entries are the exception: their key is a reserved slot that nothing writes
    // yet, which the map documents inline.
    const systemOnly = new Set(
      [...block.matchAll(/'(\/[^']+)': \{[^}]*system: true/gs)].map((m) => m[1]),
    );
    const sources = ['lib', 'components', 'app', 'stores']
      .map((dir) => join(REPO, dir))
      .filter((p) => existsSync(p));
    expect(sources.length).toBe(4);

    const unreferenced: string[] = [];
    for (const key of keys) {
      // The map itself and the generated route tree do not count as a writer.
      const hits = grepRepo(key).filter(
        (f) => !f.endsWith('stores/themeStore.ts') && !f.includes('routeTree.gen'),
      );
      if (!hits.length) unreferenced.push(key);
    }

    const allowed = [...systemOnly].length;
    expect(
      unreferenced.length <= allowed,
      `APP_ROUTE_THEME_BG keys with no writer in the tree: ${unreferenced.join(', ')} (only the \`system: true\` entries may be reserved slots)`,
    ).toBe(true);
  });
});

describe('FOUC contract: the harness itself', () => {
  /**
   * The in-page instrument must be valid JavaScript.
   *
   * It is a string held in a template literal, which means a regex escape in it is
   * one backslash away from being eaten — and that is not a theoretical failure.
   * `\\*` written as `\*` inside the template became a bare `*`, the regex it was
   * in became invalid, `INSTRUMENT_SOURCE` stopped parsing, nothing installed, and
   * the audit reported every page on the site as clean. A SyntaxError in a string
   * is invisible to `tsc`, to eslint, and to every other gate in this repo; it is
   * visible to `new Function`.
   */
  it('INSTRUMENT_SOURCE parses as JavaScript', async () => {
    const { INSTRUMENT_SOURCE } = await import('../../testing/e2e/fouc-instrument.mjs');
    expect(typeof INSTRUMENT_SOURCE).toBe('string');
    expect(INSTRUMENT_SOURCE.length).toBeGreaterThan(2000);
    expect(() => new Function(INSTRUMENT_SOURCE)).not.toThrow();
  });

  /**
   * The audit's own self-test must stay wired to every GATED detector. A detector
   * with no sabotage behind it is a detector nobody has watched fire.
   */
  it('every gated detector has a sabotage in the self-test', () => {
    const harness = read('testing/e2e/fouc.mjs');
    const sabotaged = new Set([...harness.matchAll(/expect: '([a-z-]+)'/g)].map((m) => m[1]));
    // `hydration` and `shift` are the two gated kinds with no sabotage: both are
    // produced by the browser's own observers rather than by this harness's
    // reasoning, and both were observed firing on real pages during this audit
    // (React's hydration diagnostics, and 0.443 on /laundry-sort).
    for (const kind of ['ground', 'restyle', 'late-css', 'font-swap', 'frame']) {
      expect(sabotaged, `no --self-test sabotage proves the "${kind}" detector fires`).toContain(
        kind,
      );
    }
  });
});

describe('FOUC contract: coverage', () => {
  it('every addressable page in the generated route tree is audited or excluded with a reason', () => {
    const { audited, skipped, unaccounted } = collectRoutes();

    expect(
      unaccounted,
      `These paths exist in app/routeTree.gen.ts but the FOUC audit neither visits nor excludes them.\n` +
        `Add each to DYNAMIC_ROUTE_FIXTURES (with a concrete URL) or EXCLUDED_STATIC_PATHS (with the reason it is not an HTML document) in testing/e2e/fouc-routes.mjs:\n` +
        unaccounted.map((r) => `  - ${r}`).join('\n'),
    ).toEqual([]);

    // The tree is ~290 pages; a collector that suddenly returns a handful has
    // stopped parsing the generated file rather than found a smaller site.
    expect(audited.length).toBeGreaterThan(200);
    expect(skipped.every((s) => typeof s.why === 'string' && s.why.length > 20)).toBe(true);
  });

  it('every excluded path is excluded for not being an HTML document', () => {
    const { skipped } = collectRoutes();
    // The reasons are prose, but they must name a mechanism rather than a mood.
    const vague = skipped.filter(
      (s) =>
        !/server route|static file|redirect|RSS|XML|JSON|text\/plain|admin|signed-in|tracking|prebuilt|API/i.test(
          s.why,
        ),
    );
    expect(
      vague,
      `A page may be excluded from the FOUC audit only because it is not an HTML document a reader looks at (or cannot be reached by a signed-out run). These reasons do not say that:\n${vague
        .map((s) => `  - ${s.route}: ${s.why}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('the route-tree parser still understands the generated file', () => {
    const { routes, fullPaths } = parseRouteTree();
    // If TanStack changes its codegen shape these go to zero and every other
    // assertion here passes vacuously, which is the failure mode this catches.
    expect(routes.length).toBeGreaterThan(200);
    expect(fullPaths.length).toBeGreaterThan(400);
    expect(fullPaths).toContain('/');
    expect(fullPaths).toContain('/login');
  });
});

/** Source files under the scanned roots whose text matches `pattern`. */
function grepRepoMatching(pattern: RegExp): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        if (pattern.test(readFileSync(full, 'utf8'))) hits.push(full.slice(REPO.length + 1));
      }
    }
  };
  for (const root of ['lib', 'components', 'app', 'stores', 'hooks']) {
    const dir = join(REPO, root);
    if (existsSync(dir)) walk(dir);
  }
  return hits;
}

/**
 * Source files under `lib/`, `components/`, `app/` and `stores/` that contain
 * `needle`.
 *
 * A hand-rolled walk rather than a shell `grep` so the gate behaves the same
 * wherever it runs — the commit hook, CI and a contributor's machine — and does
 * not depend on a binary being on PATH.
 */
function grepRepo(needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        if (readFileSync(full, 'utf8').includes(needle)) {
          hits.push(full.slice(REPO.length + 1));
        }
      }
    }
  };
  for (const root of ['lib', 'components', 'app', 'stores']) walk(join(REPO, root));
  return hits;
}
