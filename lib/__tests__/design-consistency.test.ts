import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §16.2 — the "global website design scheme" as an EXECUTABLE gate.
 *
 * The owner's recurring complaint through Phases G–L was that tab strips kept
 * drifting apart — each surface hand-rolling its own capsule/underline markup and
 * "converging styling on custom markup" instead of using one component. This test
 * turns the convergence into CI enforcement: a static source scan over
 * `components/` + `app/routes/` that FAILS when new drift appears, so future work
 * can't reintroduce a bespoke tab strip past review.
 *
 * Four rules (each failure prints the offending file:line + this pointer):
 *   1. `role="tablist"` may only live in the shared renderer
 *      (`components/ui/liquid-tabs.tsx`). Everything else must ride `LiquidTabs`.
 *   2. No underline-active-tab pattern: an element with `aria-selected` must not
 *      also carry a `border-b*` / `underline` marker (the §5.45 sheets obsoleted
 *      underline tabs — the active state is the flowing capsule, never a rule).
 *   3. Tab-capsule `layoutId` props may only live in sanctioned files — the
 *      renderer plus the sidebar's flowing nav capsule. Any other inline
 *      `layoutId` capsule is a hand-rolled tab strip that should be `LiquidTabs`.
 *   4. (§17.5) No conditional accent-underline bar: an element that is `absolute`
 *      + anchored to the bottom (`bottom-0`) + a hairline height (`h-px`/`h-0.5`/
 *      `h-1`) + `bg-site-accent` is an active-tab underline indicator — the exact
 *      shape RMHCoinsPage / LeaderboardColumn hand-rolled with NO tab semantics,
 *      which is why rules 1–3 (they police `role="tablist"` / `aria-selected` /
 *      `layoutId`) never saw them. This class-string signature is reliable and
 *      low-false-positive (a badge like login.tsx's `-bottom-0.5 size-7` does not
 *      match — it is neither `bottom-0` nor a hairline height).
 *
 * These are SOURCE checks (no build) so they run in the normal suite and fail the
 * moment someone re-forks a tab strip.
 *
 * MANUAL-REVIEW RULE (not executable — no reliable low-false-positive grep exists):
 * a role-less switcher that indicates its active slot by ANY means other than the
 * rule-4 underline shape (e.g. a conditional accent PILL, a segmented control, a
 * `flex-1` button row with an active tint) still belongs on `LiquidTabs`. Reviewers
 * must catch those by eye; rule 4 only nails the most common escapee shape.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['components', join('app', 'routes')];
const POINTER =
  'Use the shared <LiquidTabs> renderer (components/ui/liquid-tabs.tsx). See the ' +
  'liquid-glass v2 plan §16.2 (one tablist renderer + enforcement).';

/** The single sanctioned tablist renderer. */
const RENDERER = join('components', 'ui', 'liquid-tabs.tsx');

/**
 * Rule 1 allowlist — the ONLY `role="tablist"` usages permitted outside the
 * renderer, each an intentional, documented exception (NOT a capsule tab strip):
 *  - AlbumViewer's thumbnail filmstrip: a media carousel that navigates SLIDES
 *    via the WAI-ARIA tabs pattern (thumbnails, not label pills) — LiquidTabs
 *    renders text tabs, so it does not model an image filmstrip.
 *  - RMHLadder's admin review filter: the RMHLadder tooling uses its own
 *    deliberately-separate blueprint/industrial design system (monospace, brass
 *    hairlines — see rmhladder.css), not the liquid-glass site grammar; forcing
 *    it onto glass pills would make it INCONSISTENT with the rest of that app.
 *  - Temple of Joy's codex rail: the temple is a full-screen game outside the
 *    site shell with its own candlelit palette (temple-of-joy.css) and a
 *    glyph-over-label rail, not text pills. A glass capsule in the middle of it
 *    would read as a piece of a different product.
 * New tablists get NO entry here — they must use LiquidTabs.
 */
const TABLIST_ALLOW = new Set([
  RENDERER,
  join('components', 'library', 'AlbumViewer.tsx'),
  join('app', 'routes', '_site', 'rmhladder', 'review.tsx'),
  join('components', 'temple-of-joy', 'TempleTabs.tsx'),
]);

/**
 * Rule 3 allowlist — files permitted to host an inline tab/nav-capsule `layoutId`
 * (the flowing glass capsule, §5.47): just the renderer itself.
 *
 * `LeftSidebar.tsx` used to be listed here for its active nav capsule; it was
 * deleted with the mobile push-drawer it belonged to, so the exemption is gone.
 */
const LAYOUTID_ALLOW = new Set([RENDERER]);

/** Recursively collect production `.tsx` sources (skip generated + test files). */
function collectTsx(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collectTsx(rel, out);
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      entry.name !== 'routeTree.gen.ts'
    ) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => collectTsx(d));

/** 1-based line number for a source-string index. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/**
 * The opening JSX tag that encloses `idx` — from the nearest preceding `<` to the
 * first `>` at brace-depth 0 (so `=>` and `>` inside `{…}` attribute expressions
 * don't close the tag early). Used to test co-occurrence WITHIN one element.
 */
function enclosingTag(src: string, idx: number): string {
  let start = idx;
  while (start > 0 && src[start] !== '<') start--;
  let depth = 0;
  let end = idx;
  for (let i = idx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth <= 0) {
      end = i;
      break;
    }
    end = i;
  }
  return src.slice(start, end + 1);
}

/**
 * Rules 5–7 scan the SITE tier only (rules 8 and 9 run over the whole tree —
 * see their notes below). The full-screen games and the `--app-*`
 * apps are exempt from the `--site-*` palette by design (design-language.md §12
 * and the "games with a bespoke visual identity" note in §12) — Temple of Joy is
 * SUPPOSED to be candlelit, and forcing it onto site tokens would make it look
 * like a different product, not a more consistent one. This is the same split
 * `lib/games.ts` / `lib/apps.ts` publish; it is duplicated here rather than
 * imported because those modules pull in far more than a static scan needs.
 *
 * `rmhladder`, `rmhcalculator` and `homes` are NOT listed: they are `usesSiteTheme`
 * apps and are held to the site contract.
 */
const FULLSCREEN_TIER_DIRS = new Set([
  // Games (their own palettes / scoped variable groups in globals.css)
  'altair',
  'cookgame',
  'cursed-logic',
  'daily-puzzles',
  'dream-rift',
  'forest-explorer',
  'gabriels-horn',
  'game', // Slice It's UI (reached from slice-it/index.tsx → GameCanvas)
  'house-always-wins',
  'isleworks',
  'kowloon-knockout',
  'laundry-sort',
  'lights-out',
  'massive-march',
  'neon-driftway',
  'rmh-farming-sim',
  'signal-forge',
  'slice-it',
  'synapse-storm',
  'temple-of-joy',
  'vega',
  'velum2099',
  'versecraft',
  'void-breaker',
  // The `--app-*` full-screen app tier
  'rmhbox',
  'rmhcode',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'rmhvibe',
  'shared',
  'studio',
  // Standalone campaign/marketing arms with their own art direction
  'blm',
  'breakpoint',
  'covid',
  'doctrine',
  'history',
  'lockdown',
  'render',
  'rmh-capital',
  'rmh-pmc',
]);

/** Top-level route trees that are full-screen experiences, not `_site` pages. */
const FULLSCREEN_ROUTE_SEGMENTS = new Set([
  'altair',
  'api',
  'cookgame',
  'daily',
  'discord',
  'dream-rift',
  'forest-explorer',
  'gabriels-horn',
  'house-always-wins',
  'isleworks',
  'kowloon-knockout',
  'laundry-sort',
  'massive-march',
  'neon-driftway',
  'rmh-farming-sim',
  'rmhbox',
  'rmhcode',
  'rmhmusic',
  'rmhstudy',
  'rmhtube',
  'rmhtype',
  'rochester-offensive',
  'secret',
  'slice-it',
  'strategies',
  'studio',
  'synapse-storm',
  'temple-of-joy',
  'velum2099',
  'versecraft',
  'void-breaker',
]);

function isSiteTier(file: string): boolean {
  const parts = file.split(/[\\/]/);
  if (parts[0] === 'components') return !FULLSCREEN_TIER_DIRS.has(parts[1] ?? '');
  // app/routes/<seg>/... or app/routes/<seg>.tsx
  const seg = (parts[2] ?? '').replace(/\.tsx$/, '');
  return !FULLSCREEN_ROUTE_SEGMENTS.has(seg);
}

const SITE_FILES = FILES.filter(isSiteTier);

/**
 * Rule 6 allowlist — the one site-tier file permitted to name raw palette colours.
 * `/login` renders third-party sign-in buttons, and a provider's mark is its own
 * brand asset: Discord blurple and Google red are not ours to theme. Everything
 * else on that page is on tokens.
 */
const RAW_COLOR_ALLOW = new Set([join('app', 'routes', 'login.tsx')]);

type Violation = { file: string; line: number; detail: string };

function scanAll(): {
  tablist: Violation[];
  underline: Violation[];
  layoutId: Violation[];
  accentBar: Violation[];
  rawColor: Violation[];
  rawRadius: Violation[];
  floatingTier: Violation[];
  transitionAll: Violation[];
  deadAnimate: Violation[];
} {
  const tablist: Violation[] = [];
  const underline: Violation[] = [];
  const layoutId: Violation[] = [];
  const accentBar: Violation[] = [];
  const rawColor: Violation[] = [];
  const rawRadius: Violation[] = [];
  const floatingTier: Violation[] = [];
  const transitionAll: Violation[] = [];
  const deadAnimate: Violation[] = [];

  // A bottom-border marker (border-b / -2 / -4 / -[..]) but NOT border-b-0.
  const borderBottom = /\bborder-b(?!-0)(?:-(?:2|4|\[[^\]]*\]))?(?![\w-])/;
  // An `underline` utility used as a marker — excludes no-underline / hover: etc.
  const underlineUtil = /(?<![\w:-])underline\b/;
  const ariaSelected = /aria-selected/g;
  const roleTablist = /role=(["'])tablist\1/g;
  const layoutIdProp = /\blayoutId\s*=\s*[{"]/g;
  // Rule 4 (§17.5) — the conditional accent-underline bar. `bg-site-accent` (not
  // -dim/-fg), enclosed in a tag that is also `absolute`, anchored `bottom-0` (a
  // real word token, so `-bottom-0.5` badges are excluded), with a hairline height.
  const accentFill = /\bbg-site-accent(?![\w-])/g;
  const isAbsolute = /(?<![\w-])absolute(?![\w-])/;
  const bottomZero = /(?<![\w.-])bottom-0(?![\w.-])/;
  const hairline = /\bh-(?:px|0\.5|1)(?![\d.])/;

  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');

    if (!TABLIST_ALLOW.has(file)) {
      let m: RegExpExecArray | null;
      while ((m = roleTablist.exec(src))) {
        tablist.push({ file, line: lineAt(src, m.index), detail: 'role="tablist"' });
      }
    }

    if (!LAYOUTID_ALLOW.has(file)) {
      let m: RegExpExecArray | null;
      while ((m = layoutIdProp.exec(src))) {
        layoutId.push({ file, line: lineAt(src, m.index), detail: 'inline tab-capsule layoutId=' });
      }
    }

    let m: RegExpExecArray | null;
    while ((m = ariaSelected.exec(src))) {
      const tag = enclosingTag(src, m.index);
      const marker = borderBottom.test(tag)
        ? 'border-b'
        : underlineUtil.test(tag)
          ? 'underline'
          : null;
      if (marker) {
        underline.push({
          file,
          line: lineAt(src, m.index),
          detail: `aria-selected co-occurs with ${marker} (underline-active-tab antipattern)`,
        });
      }
    }

    while ((m = accentFill.exec(src))) {
      const tag = enclosingTag(src, m.index);
      if (isAbsolute.test(tag) && bottomZero.test(tag) && hairline.test(tag)) {
        accentBar.push({
          file,
          line: lineAt(src, m.index),
          detail: 'conditional accent-underline bar (hand-rolled active-tab indicator)',
        });
      }
    }
  }
  // ── Rules 5–7 (site tier only) ───────────────────────────────────────────
  // These read `className=` values SPECIFICALLY rather than string literals
  // generally: a class-shaped word in prose ("the old bg-black/60 skin") is a
  // comment, not a call site, and a naive literal scan reports it as a defect.
  // Same lesson the game-viewport gate records.
  const classAttr =
    /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{([\s\S]{0,1200}?)\}\s*(?=[\s/>]))/g;
  const rawPalette =
    /(?<![\w:-])(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow|decoration|placeholder|caret|accent)-(?:zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/g;
  const rawRadiusRe = /(?<![\w:-])rounded-(?:sm|md|lg|xl|2xl|3xl)(?![\w-])/g;
  // Floating UI must ride L4. A surface that is positioned, stacked and anchored
  // to an edge is a dropdown/popover/menu whatever its role attribute says.
  const positioned = /(?<![\w-])(?:absolute|fixed)(?![\w-])/;
  const stacked = /(?<![\w-])z-(?:\d{1,3}|\[\d+\])(?![\w-])/;
  const edgeAnchored =
    /(?<![\w-])(?:top-full|bottom-full|mt-\d|mb-\d|left-0|right-0|inset-x-0)(?![\w-])/;
  const lowerTier = /(?<![\w-])(?:glass-(?:fill|pane|chrome))(?![\w-])|(?<![\w-])bg-site-surface(?![\w-])/;
  const l4Tier = /(?<![\w-])glass-(?:overlay|scrim)(?![\w-])/;
  const transitionAllRe = /(?<![\w-])transition-all(?![\w-])/g;
  /**
   * Rule 9 — the `tailwindcss-animate` vocabulary, which this project does not
   * have. It was a Tailwind v3 plugin; the v3→v4 migration dropped it and
   * nothing replaced it, so `animate-in`, `fade-in-0`, `zoom-in-95` and friends
   * compile to **zero rules**. 103 of them were sitting in the source across 18
   * files — including the command palette, the composer and every Radix
   * `data-[state=open]:` pair — describing motion that has never once run.
   *
   * That is worse than no animation: it reads as intent, so nobody adds the
   * real thing. If these are wanted back, the fix is `lib/motion.ts`'s
   * `scaleIn` / `popIn` / `modalContent` variants (the animation system this
   * project actually documents, design-language.md §7), not a fourth one.
   *
   * This scans the whole tree, not just the site tier: a class that produces no
   * CSS is dead everywhere, and a game's palette exemption has nothing to say
   * about it.
   */
  const deadAnimateRe =
    /(?<![\w:./-])(?:[\w-]+(?:\[[^\]]*\])?:)*(?:animate-(?:in|out)|fade-(?:in|out)|zoom-(?:in|out)|slide-(?:in-from|out-to)-(?:top|bottom|left|right)|fill-mode-(?:both|forwards|backwards|none))(?:-(?:\d+(?:\/\d+)?|\[[^\]]*\]))?(?![\w./-])/g;

  for (const file of SITE_FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    classAttr.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = classAttr.exec(src))) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
      const line = lineAt(src, m.index);

      if (!RAW_COLOR_ALLOW.has(file)) {
        rawPalette.lastIndex = 0;
        let c: RegExpExecArray | null;
        while ((c = rawPalette.exec(value))) {
          rawColor.push({ file, line, detail: `raw palette colour \`${c[0]}\`` });
        }
      }

      rawRadiusRe.lastIndex = 0;
      let r: RegExpExecArray | null;
      while ((r = rawRadiusRe.exec(value))) {
        rawRadius.push({ file, line, detail: `hardcoded radius \`${r[0]}\`` });
      }

      if (
        positioned.test(value) &&
        stacked.test(value) &&
        edgeAnchored.test(value) &&
        lowerTier.test(value) &&
        !l4Tier.test(value)
      ) {
        floatingTier.push({
          file,
          line,
          detail: 'floating surface below L4 (no backdrop blur → text ghosts through)',
        });
      }
    }
  }

  // Rules 8 and 9 run over EVERY file, not just the site tier. Neither is a
  // palette question — one is a rendering cost and the other is a class that
  // produces no CSS — so a game has no more claim to an exemption than a
  // settings page does.
  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    classAttr.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = classAttr.exec(src))) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
      deadAnimateRe.lastIndex = 0;
      let da: RegExpExecArray | null;
      while ((da = deadAnimateRe.exec(value))) {
        deadAnimate.push({
          file,
          line: lineAt(src, m.index),
          detail: `\`${da[0]}\` compiles to nothing`,
        });
      }

      transitionAllRe.lastIndex = 0;
      if (transitionAllRe.test(value)) {
        transitionAll.push({ file, line: lineAt(src, m.index), detail: '`transition-all`' });
      }
    }
  }

  return {
    tablist,
    underline,
    layoutId,
    accentBar,
    rawColor,
    rawRadius,
    floatingTier,
    transitionAll,
    deadAnimate,
  };
}

function report(label: string, v: Violation[]): string {
  return (
    `\n${label} (${v.length}):\n` +
    v.map((x) => `  ${x.file}:${x.line} — ${x.detail}`).join('\n') +
    `\n\n${POINTER}\n`
  );
}

describe('design consistency — one tab-strip grammar (§16.2)', () => {
  const {
    tablist,
    underline,
    layoutId,
    accentBar,
    rawColor,
    rawRadius,
    floatingTier,
    transitionAll,
    deadAnimate,
  } = scanAll();

  it('scans a non-trivial set of production sources', () => {
    // Guards the walker itself — a broken path would make every rule vacuously pass.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain(RENDERER);
    // …and the site-tier filter, which rules 5–7 depend on. If the exemption
    // lists ever swallowed the site the new rules would pass on an empty set.
    expect(SITE_FILES.length).toBeGreaterThan(200);
    expect(SITE_FILES).toContain(join('components', 'feed', 'PageLayout.tsx'));
    expect(SITE_FILES).not.toContain(join('components', 'temple-of-joy', 'TempleTabs.tsx'));
  });

  it('role="tablist" lives only in LiquidTabs (+ documented allowlist)', () => {
    expect(tablist, report('Stray role="tablist"', tablist)).toEqual([]);
  });

  it('no aria-selected element also carries a border-b / underline marker', () => {
    expect(underline, report('Underline-active-tab pattern', underline)).toEqual([]);
  });

  it('tab-capsule layoutId props live only in sanctioned files', () => {
    expect(layoutId, report('Ad-hoc tab-capsule layoutId', layoutId)).toEqual([]);
  });

  it('no conditional accent-underline bar (§17.5 hand-rolled active-tab indicator)', () => {
    expect(accentBar, report('Conditional accent-underline bar', accentBar)).toEqual([]);
  });

  it('site-tier UI names no raw Tailwind palette colour', () => {
    expect(
      rawColor,
      report('Raw palette colour in site UI', rawColor).replace(
        POINTER,
        'Use a --site-* token utility (bg-site-surface, text-site-danger, ' +
          'text-site-warning, …). A raw palette colour is the same pixel in every ' +
          'theme, which is the one thing the token contract exists to prevent. If ' +
          'the colour is genuinely domain-fixed (a playing card, a brand mark), add ' +
          'a scoped variable group like --casino-* and bind it in @theme inline — ' +
          'see docs/design-language.md §1.',
      ),
    ).toEqual([]);
  });

  it('site-tier UI uses the themed radius scale', () => {
    expect(
      rawRadius,
      report('Hardcoded radius in site UI', rawRadius).replace(
        POINTER,
        'Use rounded-site / rounded-site-sm. `rounded-lg` is a fixed 8px that ' +
          "ignores each theme's --site-radius (high-contrast squares its corners; " +
          'the hardcoded ones stay round). rounded-full and rounded-none are fine — ' +
          'a pill and a square corner are shapes, not radii.',
      ),
    ).toEqual([]);
  });

  it('nothing uses `transition-all`', () => {
    expect(
      transitionAll,
      report('`transition-all`', transitionAll).replace(
        POINTER,
        'Name the properties instead: `transition-colors`, `transition-transform`, ' +
          '`transition-opacity`, a `transition-[a,b]` list, or plain `transition` ' +
          '(every visual property, no layout ones). `all` makes the engine watch ' +
          'EVERY animatable property including width/height/top/margin, so a class ' +
          'change that happens to touch layout animates a reflow. If a layout ' +
          'property is genuinely what you want to animate, it is almost always ' +
          'cheaper as a transform — a progress bar is `scaleX` on a full-width ' +
          'fill, not an animated `width` (see components/onboarding/FirstWeekCard).',
      ),
    ).toEqual([]);
  });

  it('no `tailwindcss-animate` classes — the plugin is not installed', () => {
    expect(
      deadAnimate,
      report('Class that compiles to no CSS', deadAnimate).replace(
        POINTER,
        '`animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*` / ' +
          '`fill-mode-*` come from `tailwindcss-animate`, a Tailwind v3 plugin ' +
          'this project does not have — they produce ZERO rules, so the element ' +
          'never animates. Use the documented motion system instead: framer-motion ' +
          'with `lib/motion.ts` (`scaleIn`, `popIn`, `overlay`, `modalContent`), or ' +
          'the CSS enters that do exist (`.page-enter`, `radial-page-rise`, ' +
          '`.feed-item-enter`). See design-language.md §7.',
      ),
    ).toEqual([]);
  });

  it('floating UI rides the L4 overlay tier', () => {
    expect(
      floatingTier,
      report('Floating surface below L4', floatingTier).replace(
        POINTER,
        'A dropdown / popover / menu / autocomplete is `.glass-overlay` ' +
          '(design-language.md §5.1). L1 `.glass-fill` has NO backdrop blur and a ' +
          'lighter tint by design — it is the tier for repeated CARDS — so a menu ' +
          'built on it sits transparent over whatever it opened on top of and the ' +
          'labels ghost. `.glass-overlay` carries the blur plus the ≥78% legibility ' +
          'floor that the Glass clarity slider cannot push under.',
      ),
    ).toEqual([]);
  });
});

/**
 * ─────────────────────── the token contract, in CSS ───────────────────────
 *
 * Rules 5 and 6 above police raw palette colours and hardcoded radii in `.tsx`.
 * They never opened a `.css` file, and there are 29,022 lines of them under
 * `components/` — so `bg-red-600` failed the build while `background: #e11d48`
 * two directories away did not, and `rounded-xl` failed while
 * `border-radius: 14px` did not.
 *
 * That is most of where the contract actually leaked. `library.css` alone
 * carries 42 raw hex colours and 33 hardcoded radii; a purchased user theme —
 * which design.md §6 says must render every component correctly precisely
 * because none of them knows it exists — reaches none of them.
 *
 * The gate is a ratchet, not a cliff. Every existing violation is frozen below
 * with its count; a file may only get cleaner. New files get zero tolerance.
 * The games and `--app-*` tiers are exempt here for the same reason they are
 * exempt from rules 5–7: Temple of Joy is supposed to be candlelit.
 */

function collectCss(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectCss(rel, out);
    } else if (entry.name.endsWith('.css')) {
      out.push(rel);
    }
  }
  return out;
}

/** `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd` — but not a 5- or 7-digit run. */
const CSS_HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/g;
const CSS_RADIUS = /border-radius:\s*([^;}\n]+)/g;

/**
 * A radius that should have been a token.
 *
 * Exempt: anything already reading a `var(--…)`; `0`; `50%` and the 9999px
 * idiom, which are *shapes* (a circle, a pill) rather than the theme's corner
 * rounding — no theme wants a "circle" to stop being a circle.
 */
function isThemeableRadius(value: string): boolean {
  const v = value.trim();
  if (/var\(|inherit|unset|initial|revert/.test(v)) return false;
  if (/^0(px|rem|em|%)?$/.test(v)) return false;
  if (/50%/.test(v) || /\b9{3,}px\b/.test(v)) return false;
  return /\d/.test(v);
}

function cssViolations(src: string): { hex: number; radius: number } {
  const hex = (src.match(CSS_HEX) ?? []).length;
  let radius = 0;
  CSS_RADIUS.lastIndex = 0;
  for (let m = CSS_RADIUS.exec(src); m; m = CSS_RADIUS.exec(src)) {
    if (isThemeableRadius(m[1])) radius++;
  }
  return { hex, radius };
}

/**
 * The frozen state, 2026-08-03. Lower a number when you clean a file; delete
 * the entry when it reaches zero. Never raise one — that is the whole point.
 *
 * Suggested order to burn it down: `library.css` first (the Library is a
 * flagship consumer surface and the worst offender), then
 * `creator-studio.css`, then the rest.
 */
const CSS_DEBT: Record<string, { hex: number; radius: number }> = {
  'components/library/library.css': { hex: 42, radius: 33 },
  'components/creator-studio/creator-studio.css': { hex: 32, radius: 5 },
  'components/rmhtech/rmhtech.css': { hex: 16, radius: 5 },
  'components/library/album-admin.css': { hex: 12, radius: 10 },
  'components/library/album-viewer.css': { hex: 7, radius: 3 },
  'components/creator-studio/storefront.css': { hex: 5, radius: 3 },
  'components/rmhladder/rmhladder.css': { hex: 0, radius: 14 },
  'components/feed/feed.css': { hex: 0, radius: 7 },
  'components/security/security.css': { hex: 0, radius: 4 },
  'components/rmhcalculator/rmhcalculator.css': { hex: 0, radius: 3 },
  'components/builds/builds.css': { hex: 2, radius: 2 },
  'components/library/book-3d.css': { hex: 1, radius: 2 },
  'components/radial/radial.css': { hex: 2, radius: 0 },
};

const SITE_CSS = collectCss('components').filter((f) => {
  const parts = f.split(/[\\/]/);
  return !FULLSCREEN_TIER_DIRS.has(parts[1] ?? '');
});

describe('the token contract holds in CSS too', () => {
  const measured = SITE_CSS.map((file) => ({
    file: file.split(/[\\/]/).join('/'),
    ...cssViolations(readFileSync(join(ROOT, file), 'utf8')),
  }));

  it('scans the site-tier stylesheets at all', () => {
    // Guards the collector: if `SITE_CSS` ever silently goes empty (a rename, a
    // changed tier set) every assertion below would pass vacuously.
    expect(measured.length).toBeGreaterThan(10);
    expect(measured.map((m) => m.file)).toContain('components/feed/feed.css');
    expect(measured.map((m) => m.file)).not.toContain(
      'components/temple-of-joy/temple-of-joy.css',
    );
  });

  it('adds no raw hex colour or hardcoded radius to a clean stylesheet', () => {
    const offenders = measured
      .filter((m) => !(m.file in CSS_DEBT) && (m.hex > 0 || m.radius > 0))
      .map((m) => `${m.file} — ${m.hex} hex, ${m.radius} hardcoded radius`);
    expect(
      offenders,
      'Raw colour / radius in a site-tier stylesheet. Use the token contract: ' +
        '`var(--site-surface)`, `var(--site-accent)`, `var(--site-radius)` and ' +
        'friends (design.md §2 — "nothing is hardcoded"). A theme nobody on the ' +
        'team has opened must still render this file correctly, and a hex here ' +
        'is invisible to every theme, to high contrast, and to the colour-vision ' +
        'modes. If a value is genuinely domain-fixed (a playing card, a rarity ' +
        'tier), give it a scoped variable group in globals.css instead.',
    ).toEqual([]);
  });

  it('never lets a stylesheet get worse than its frozen count', () => {
    const regressions: string[] = [];
    for (const [file, frozen] of Object.entries(CSS_DEBT)) {
      const now = measured.find((m) => m.file === file);
      if (!now) continue; // deleted or renamed — the drained check below reports it
      if (now.hex > frozen.hex) {
        regressions.push(`${file} — hex ${frozen.hex} → ${now.hex}`);
      }
      if (now.radius > frozen.radius) {
        regressions.push(`${file} — radius ${frozen.radius} → ${now.radius}`);
      }
    }
    expect(
      regressions,
      'A stylesheet on the CSS_DEBT list gained violations. The list is a ' +
        'ratchet: these files are allowed to stay as bad as they are while they ' +
        'get cleaned up, and are not allowed to get worse. Put new colours and ' +
        'radii on tokens.',
    ).toEqual([]);
  });

  it('drains the debt list as files are cleaned', () => {
    const stale: string[] = [];
    for (const [file, frozen] of Object.entries(CSS_DEBT)) {
      const now = measured.find((m) => m.file === file);
      if (!now) {
        stale.push(`${file} — no longer scanned; remove it from CSS_DEBT`);
        continue;
      }
      if (now.hex === 0 && now.radius === 0) {
        stale.push(`${file} — now clean; remove it from CSS_DEBT`);
      } else if (now.hex < frozen.hex || now.radius < frozen.radius) {
        stale.push(
          `${file} — improved to ${now.hex} hex / ${now.radius} radius; ` +
            `lower its CSS_DEBT entry to match`,
        );
      }
    }
    expect(
      stale,
      'CSS_DEBT is out of date. Lowering these numbers when you clean a file is ' +
        'what stops the list from quietly becoming permission.',
    ).toEqual([]);
  });
});

/**
 * ───────────────── one page frame, not twenty-nine copies ─────────────────
 *
 * `components/feed/PageLayout.tsx` exports both halves of the shared frame:
 * `PageLayout` (frame + title header) and `PageFrame` (frame only, for a page
 * whose content already draws its own `ColumnHeader`).
 *
 * 29 `_site` routes used to import `AnimatedMain` and `ContextRail` directly
 * and assemble the frame themselves, because `PageLayout` always rendered a
 * header and there was no way to ask for just the frame. The measure, the
 * `pb-dock` inset and the rail reservation were therefore written out 29 extra
 * times — and drifted into three width spellings, two rail spellings, and 22
 * files still importing a `targetWidth` constant the API had stopped taking.
 * `docs/page-consistency.md` exists because this drifts; nothing detected it.
 *
 * The allowlist is empty on purpose. If a page genuinely needs a bespoke
 * frame, add it here with a reason rather than importing around the rule.
 */
const FRAME_ALLOW = new Set<string>([]);

describe('site pages take the shared frame', () => {
  const routeFiles = FILES.filter((f) =>
    f.split(/[\\/]/).slice(0, 3).join('/') === 'app/routes/_site' ||
    f.startsWith(join('app', 'routes', '_site')),
  );

  it('finds the _site routes at all', () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  it('imports no frame primitive directly', () => {
    const offenders: string[] = [];
    for (const file of routeFiles) {
      if (FRAME_ALLOW.has(file)) continue;
      const src = readFileSync(join(ROOT, file), 'utf8');
      const bad = ['feed/AnimatedMain', 'feed/ContextRail'].filter((m) => src.includes(m));
      if (bad.length > 0) offenders.push(`${file} — imports ${bad.join(' + ')}`);
    }
    expect(
      offenders,
      'A page under app/routes/_site assembled the page frame by hand. Use ' +
        '`PageLayout` (frame + title header) or `PageFrame` (frame only, when ' +
        "the page's own column already renders a ColumnHeader) from " +
        '@/components/feed/PageLayout. Both live in one file so the reading ' +
        'measure, the pb-dock inset and the live-rail portal are stated once. ' +
        'See docs/page-consistency.md.',
    ).toEqual([]);
  });

  it('passes no deprecated rail spacer', () => {
    // `reserve` / `compactReserve` are documented no-ops on ContextRail — the
    // shell's grid keeps the column centred without a spacer — but two dozen
    // call sites still passed them, which reads as load-bearing to the next
    // person to touch the file.
    const offenders: string[] = [];
    for (const file of [...routeFiles, ...SITE_FILES]) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      if (/<ContextRail[^>]*\b(reserve|compactReserve)\b/.test(src)) offenders.push(file);
    }
    expect(
      offenders,
      '`reserve` and `compactReserve` do nothing (see ContextRail\'s own ' +
        'JSDoc). Drop the prop rather than carrying it forward.',
    ).toEqual([]);
  });
});
