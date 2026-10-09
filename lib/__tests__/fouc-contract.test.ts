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
   * A page that paints the document ground must take the colour FROM the map, not
   * repeat it.
   *
   * `paintDocumentGround` is the shared writer, and a page calling it is doing the
   * right thing — the problem is where it gets the colour. The pre-paint script
   * paints from `APP_ROUTE_THEME_BG` before any of this code runs, so a literal in
   * the caller is a second copy of a value that has to match, and the two drifted
   * exactly as you would expect: `/dunesday`'s entry named `--ds-ground`
   * (`#bfe6ff`, the wallpaper's base) while `DunesdayOS` painted `#1a4f8f`. The
   * document was pre-painted one blue and repainted another on every load, and
   * fixing the entry's DEFAULT only moved the flash (Δluma 0.738 → 0.671) because
   * the colour itself was wrong.
   *
   * `components/pf2ecal/theme.ts` has always read the map, and the board never
   * drifted this way. That is the pattern, so this makes it the rule. Reading
   * `appRouteGround` counts: it is the map plus the stored-preference resolution.
   */
  it('every page that paints the document ground reads its colours from APP_ROUTE_THEME_BG', () => {
    const offenders: string[] = [];
    for (const file of grepRepoMatching(/\bpaintDocumentGround\s*\(/)) {
      // The helper's own definition, and the runtime that drives it for the site
      // tier, both live in the store that owns the map.
      if (file === 'stores/themeStore.ts') continue;
      const src = read(file);
      // Two ways to read the map, both correct: the map itself, or
      // `appRouteGround`, which is the map plus the stored-preference resolution
      // (`components/Providers.tsx` uses that one, since it has a pathname and no
      // opinion about which page it is on).
      if (src.includes('APP_ROUTE_THEME_BG') || src.includes('appRouteGround')) continue;
      // A hex literal anywhere in the call is the drift this catches.
      const literal = src.match(/paintDocumentGround\([^)]*#[0-9a-fA-F]{3,8}/);
      offenders.push(
        `${file} calls paintDocumentGround${
          literal ? ` with a colour literal (${literal[0].slice(-7)})` : ''
        } without reading APP_ROUTE_THEME_BG. The pre-paint script in app/routes/__root.tsx paints from that map before this code runs, so a second copy of the colour here is a flash waiting for the two to disagree. Read the entry instead — see components/pf2ecal/theme.ts.`,
      );
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * Every `APP_ROUTE_THEME_BG` entry must say WHICH WAY ITS PAGE OPENS.
   *
   * The map used to assume dark when nothing was stored. That is right for the
   * `--app-*` tier and wrong for any page that opens light, and the wrongness is
   * silent — the entry looks complete, the lookup succeeds, and the page flashes.
   * It has now happened twice:
   *
   * - Temple of Joy opens at Dawn (cream). Pre-painted near-black: Δluma 0.945.
   * - `/dunesday` opens in day (Aero sky blue), and its entry was added on `main`
   *   with no default at all. Pre-painted deep night blue: Δluma 0.738, every
   *   first load. The audit caught it the same hour the branch merged `main`.
   *
   * So the default may no longer be inherited. An entry must either carry
   * `system: true` (resolve from `prefers-color-scheme`, for a page that persists
   * nothing) or state `defaultDark` outright. There is no third option, and that
   * is the whole point: a reviewer adding a page now has to look up what its store
   * defaults to, which is the step both bugs skipped.
   */
  it('every APP_ROUTE_THEME_BG entry declares how its page opens', () => {
    const themeStore = read('stores/themeStore.ts');
    const block = themeStore.slice(
      themeStore.indexOf('export const APP_ROUTE_THEME_BG'),
      themeStore.indexOf('export function appRouteGround'),
    );

    // Split on the top-level route keys; each chunk is one entry's body.
    const entries = [...block.matchAll(/'(\/[a-z0-9-]+)':\s*\{([\s\S]*?)\n {2}\},/g)].map((m) => ({
      route: m[1],
      body: m[2],
    }));
    expect(entries.length, 'the APP_ROUTE_THEME_BG parser found no entries').toBeGreaterThan(3);

    const silent = entries.filter(
      (e) => !/\bsystem:\s*true/.test(e.body) && !/\bdefaultDark:\s*(?:true|false)/.test(e.body),
    );
    expect(
      silent.map((e) => e.route),
      `These APP_ROUTE_THEME_BG entries inherit the dark default silently. Add \`defaultDark: true\` or \`false\` (whichever the page's own store defaults to — look it up), or \`system: true\` if the page follows prefers-color-scheme:\n${silent
        .map((e) => `  - ${e.route}`)
        .join('\n')}`,
    ).toEqual([]);
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

describe('FOUC contract: hydration', () => {
  /**
   * A hydration mismatch with no Suspense boundary between it and the document
   * makes React re-render the WHOLE document — and React 19 resets `<html>`'s
   * attributes to its props when it does, wiping every class, `data-*` attribute
   * and inline style the pre-paint scripts set. So a mismatch anywhere is a
   * full-document flash of the default theme. These are the three shapes that
   * produced one, as source-level rules.
   */

  /**
   * Better Auth's hook starts every CLIENT render at `isPending: true`; the
   * server rendered from its own answer. `/login` rendered its form on the server
   * and a spinner on the client's first pass, so React #418'd on every signed-out
   * redirect to it. `useSession()` from `components/Providers` is seeded from the
   * server's session lookup on both sides.
   */
  it('nothing renders from authClient.useSession() except the provider that wraps it', () => {
    const callers = grepRepoMatching(/authClient\.useSession\(\)/).filter((f) => {
      const src = readFileSync(join(REPO, f), 'utf8');
      // Mentions in comments are fine; a call is a `= authClient.useSession()`.
      return /=\s*authClient\.useSession\(\)/.test(src);
    });
    expect(
      callers,
      'use `useSession()` from @/components/Providers — the raw hook disagrees with the server on the first client render',
    ).toEqual(['components/Providers.tsx']);
  });

  /**
   * A 404 thrown by a nested loader: the server builds `<head>` only up to the
   * not-found boundary, TanStack's client `hydrate()` builds it for every match,
   * and an inline `<script>` the server never sent fails hydration for the whole
   * document. `lib/router/not-found-head.ts` applies the server's cut on the
   * client; this keeps it installed.
   */
  it('the router applies the server-side not-found head cut on the client', () => {
    expect(read('app/router.tsx')).toMatch(/installNotFoundHeadGuard\(router\.routesById\)/);
  });

  /**
   * TanStack Start already splits a route's `component` into its own chunk and
   * loads it BEFORE hydrating. A `lazy()` inside that component can still be
   * pending when hydration reaches it, and any update that reaches the boundary
   * in that window — a session resolving, a context value changing — makes React
   * discard the server-rendered page and show the fallback until the chunk
   * lands. Measured on 30 routes: finished pages blanked to "Loading…" for
   * 90–1800ms and came back (docs/fouc-audit-2026-10-06.md §13).
   *
   * So a route module imports its page statically. The entries below are the
   * `lazy()`s that cannot do that harm, each for the reason given; the list is
   * one-directional — an entry whose file no longer uses `lazy()` fails until
   * it is removed, and a new one needs the same justification.
   */
  const LAZY_IN_ROUTE_ALLOWED: Record<string, string> = {
    'app/routes/_site.tsx':
      'first-run/welcome modals, cookie consent, shortcuts and the mini player — mounted on the client after an interaction or a stored flag, never server-rendered',
    'app/routes/_site/admin/blog/$slug/edit.tsx':
      'admin-only MDX editor, behind auth: not in the audit, nothing public to swap',
    'app/routes/_site/admin/blog/new.tsx': 'admin-only MDX editor, behind auth',
    'app/routes/_site/admin/slice-it-content.tsx': 'admin-only dashboard, behind auth',
    // The two 3D showcases moved off /services' tab strip onto pages of their
    // own (minimalism audit, 2026-10-09). The page header is server-rendered;
    // only the three.js stage is lazy, behind a height-holding fallback.
    'app/routes/_site/services/cars.tsx':
      'the three.js fleet stage is client-only; title and lede server-render, the fallback holds its height',
    'app/routes/_site/services/fashion.tsx':
      'the three.js wardrobe stage is client-only; title and lede server-render, the fallback holds its height',
    'app/routes/altair/index.tsx':
      'client-only game screen: the server renders the fallback, so there is no server markup to lose',
    'app/routes/altair/multiplayer/$lobbyId.tsx':
      'client-only multiplayer screens, reached after a socket handshake',
    'app/routes/discord/index.tsx':
      'Discord Activities render only after the SDK handshake, which is client-only',
    'app/routes/discord/lights-out.tsx':
      'Discord Activity, rendered after the client-only SDK handshake',
    'app/routes/discord/rmhbox.tsx':
      'Discord Activity, rendered after the client-only SDK handshake',
    'app/routes/forest-explorer/explore.tsx':
      'client-only 3D scene: the server renders the fallback',
    'app/routes/forest-explorer/story.tsx': 'client-only 3D scene: the server renders the fallback',
    'app/routes/isleworks.tsx': 'client-only 3D scene: the server renders the fallback',
    'app/routes/library.$slug.tsx': 'the book and EPUB readers open from the page on demand',
    'app/routes/rmhcode/index.tsx': 'the token generator opens on demand from the page',
    'app/routes/rmhmusic/$roomId.tsx': 'the visualizer mounts once audio is playing',
    'app/routes/slice-it/edit.$songId.tsx': 'the chart editor, behind auth, client-only canvas',
    'app/routes/synapse-storm.tsx': 'client-only WebGL game: the server renders the fallback',
    'app/routes/temple-of-joy/index.tsx': 'client-only game gate: the server renders the fallback',
    'app/routes/velum2099.tsx': 'client-only WebGL game: the server renders the fallback',
  };

  it('route modules import their page statically, except the reviewed lazy() boundaries', () => {
    const lazyRoutes = grepRepoMatching(/=\s*lazy\(/)
      .filter((f) => f.startsWith('app/routes/'))
      .sort();
    const unreviewed = lazyRoutes.filter((f) => !(f in LAZY_IN_ROUTE_ALLOWED));
    expect(
      unreviewed,
      "import the page statically — Start already code-splits route components (see this test's docblock)",
    ).toEqual([]);
    const stale = Object.keys(LAZY_IN_ROUTE_ALLOWED).filter((f) => !lazyRoutes.includes(f));
    expect(
      stale,
      'these no longer use lazy() — remove their LAZY_IN_ROUTE_ALLOWED entries',
    ).toEqual([]);
  });
});

describe('FOUC contract: fonts', () => {
  /**
   * Every display family is self-hosted with `font-display: optional`
   * (`scripts/gen-self-hosted-fonts.ts`): a face that misses its ~100ms window is
   * not used for that page view, so it cannot swap under text the reader is
   * looking at. A Google Fonts stylesheet appended after paint — what every route
   * did before, by design — guarantees exactly that swap.
   */
  it('no page loads a font from Google Fonts', () => {
    const hits = grepRepoMatching(/fonts\.googleapis\.com/).filter(
      // Server-side OG card rendering fetches font binaries at build/request time;
      // nothing there reaches a browser.
      (f) => !/\.server\.tsx?$/.test(f),
    );
    expect(hits, 'self-host the face — see scripts/gen-self-hosted-fonts.ts').toEqual([]);
  });

  it('every generated face is font-display: optional', () => {
    const dir = join(REPO, 'app/fonts');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(join(dir, file), 'utf8');
      const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
      expect(faces.length, `${file} declares no faces`).toBeGreaterThan(0);
      for (const face of faces) {
        expect(face, `${file}: a display face that can swap`).toMatch(/font-display:\s*optional;/);
      }
    }
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
    // `shift` is the one gated kind with no sabotage: it is produced by the
    // browser's own layout-shift observer rather than by this harness's
    // reasoning, and it was observed firing on real pages (0.443 on
    // /laundry-sort). `hydration` used to be in the same category — until it
    // turned out to have been deaf to production builds all along (React reports
    // there through `reportError`, not the console), which is the argument for
    // proving every detector that CAN be proved.
    for (const kind of ['ground', 'restyle', 'late-css', 'font-swap', 'hydration', 'frame']) {
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
