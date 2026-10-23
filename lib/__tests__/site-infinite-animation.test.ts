/**
 * Ambient motion has an owner, or it does not run (gates N3 and N12, docs/plans/plasmatic-jelly/05-gates-docs-naming.md
 * §2; generalises `static-backdrop.test.ts`).
 *
 * ## N3 — no new perpetual CSS animation on the site tier
 *
 * Plasmatic Jelly is ALWAYS moving (master plan R7), which makes "just add an `infinite` keyframe for the haze" the
 * most tempting shortcut in the codebase. A free-standing `infinite` keyframe has none of the switches the jelly
 * services carry — not hidden-tab, not offscreen, not `jellyMotion = still`, not the degraded tiers, not the budget —
 * and it is exactly what `testing/e2e/frame-budget.mjs --gate` exists to catch, one release too late. So:
 *
 *  - every `infinite` animation in the site-tier stylesheets (`app/*.css`, `components/{ui,radial,feed,site}/**`)
 *    is either on the frozen, justified {@link BASELINE} (loaders, skeletons, live dots — all on transient or tiny
 *    elements), or
 *  - it is one of the two SANCTIONED carrier keyframes, `jelly-drift` / `jelly-current`, declared only on selectors
 *    under `.jelly-flow` — the carrier `lib/jelly/flow-carriers.ts` attaches only to visible hosts within budget and
 *    removes under every non-ambient state;
 *  - the carrier is killed (`display: none`) under every degraded root class (read from `DEGRADED_ROOT_SELECTOR` —
 *    not restated) plus the app high-contrast theme, reduced transparency, forced colours and print, and PAUSED
 *    (`animation-play-state: paused`) while scrolling, under `still`, and while a game is in play.
 *
 * The baseline only shrinks: an entry that no longer matches fails "the baseline stays honest".
 *
 * ## N12 — the haze is under the text, always
 *
 * 01 §6 item 1. Every jelly paint layer inside a host (`.jelly-flow`, `.jelly-haze-canvas`, the rim
 * `.liquid-glass-canvas`, the fallback `.liquid-light`) declares a NEGATIVE z-index, and the hosts that carry them are
 * isolated (`isolation: isolate`), so the negative layer resolves inside the host — above its tint, below every
 * child. Nothing jelly paints at z ≥ 0 inside a host. The one body-level exception is the arc layer (03 D1), which is
 * `pointer-events: none` and stacks on the named `--z-arcs` token.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEGRADED_ROOT_SELECTOR } from '@/lib/jelly/tiers';

const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (file: string) => strip(readFileSync(join(ROOT, file), 'utf8'));

function collectCss(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') collectCss(rel, out);
    } else if (e.name.endsWith('.css')) out.push(rel);
  }
  return out;
}

/** The site-tier stylesheets (05 N3 scope). `app/` is top-level only: `app/fonts/` is generated @font-face. */
const SHEETS = [
  ...readdirSync(join(ROOT, 'app'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => `app/${f}`),
  ...['ui', 'radial', 'feed', 'site'].flatMap((d) => collectCss(`components/${d}`)),
].sort();

/** Innermost `selector { declarations }` pairs — nested @media/@layer bodies match at their leaves. */
function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

/** Every @keyframes name declared in the scanned sheets. */
const KEYFRAMES = new Set(
  SHEETS.flatMap((f) => [...read(f).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])),
);

interface Perpetual {
  file: string;
  name: string;
  selector: string;
}

/** `infinite` animations: the shorthand, an iteration-count longhand, or a Tailwind `--animate-*` theme value. */
function perpetual(file: string): Perpetual[] {
  const out: Perpetual[] = [];
  for (const { selector, body } of rules(read(file))) {
    const decls = body.split(';');
    const named = decls
      .map((d) => /^\s*animation-name\s*:\s*([\w-]+)/.exec(d)?.[1])
      .find(Boolean);
    for (const d of decls) {
      const shorthand = /^\s*(?:animation|--animate-[\w-]+)\s*:\s*([\s\S]+)$/.exec(d);
      if (shorthand && /\binfinite\b/.test(shorthand[1])) {
        const name =
          shorthand[1].match(/[\w-]+/g)?.find((t) => KEYFRAMES.has(t)) ??
          shorthand[1].match(/[a-z][\w-]*/i)?.[0] ??
          '?';
        out.push({ file, name, selector });
      } else if (/^\s*animation-iteration-count\s*:\s*infinite\b/.test(d)) {
        out.push({ file, name: named ?? '?', selector });
      }
    }
  }
  return out;
}

/**
 * The frozen debt, 2026-10-23: `file :: keyframe` → why it may loop. Each is a transient or tiny element (a loader
 * that exists only while something loads, a skeleton that exists only until content lands, a live dot) — none is a
 * surface or a backdrop. Remove an entry when its loop goes; never add one. New ambient motion goes through the jelly
 * services (docs/plasmatic-jelly-system.md).
 *
 * Removed 2026-10-23 (H1): `dock-globe-shimmer` and `dock-globe-glint` (now one sweep per hover) and
 * `globe-current-halo` (now three breaths when a pin becomes current). The entries had called them "icon-sized" and
 * "open hub only", but all three ran on the DOCKED globe — every desktop page, at rest, under `still` too — and held
 * the page at ≈58 frames/s (`testing/e2e/frame-budget.mjs --gate`).
 */
const BASELINE = new Map<string, string>([
  ['app/globals.css :: pulse', 'Tailwind `animate-pulse-slow` theme token: loading placeholders only'],
  ['app/globals.css :: rainbow-shift', 'cosmetic name-colour effect on a purchased username, text-sized'],
  ['app/globals.css :: glitch', 'cosmetic name effect on a purchased username, text-sized'],
  ['app/globals.css :: shake', 'cosmetic name effect on a purchased username, text-sized'],
  ['app/globals.css :: dr-float', 'Dream Rift landing title float (its game landing, not a surface)'],
  ['app/globals.css :: dr-title-glow', 'Dream Rift landing title glow (its game landing, not a surface)'],
  ['app/globals.css :: shimmer', 'skeleton shimmer — exists only until content arrives'],
  ['app/globals.css :: liquid-skeleton-drift', 'skeleton drift — exists only until content arrives'],
  ['app/globals.css :: rad-loader-pulse', 'route loader — exists only while a route loads'],
  ['app/globals.css :: rad-loader-orbit', 'route loader — exists only while a route loads'],
  ['app/globals.css :: delight-ribbon', 'celebration ribbon, mounted only for the celebration'],
  ['components/radial/radial.css :: radial-pulse-soft', 'unread / live dots, a few px'],
  [
    'components/radial/radial.css :: globe-armed',
    'the reticle while a hold is armed (hub or docked globe) — only while the pointer is down on a full ring',
  ],
  ['components/radial/eversion/eversion.css :: evert-popup-turn', 'eversion popup spinner, while a navigation runs'],
  ['components/feed/feed.css :: feed-live-pulse', 'the live indicator dot on a live item'],
]);

/** The two carrier keyframes the jelly material owns (01 §3.2), and the only selector they may run under. */
const SANCTIONED = new Set(['jelly-drift', 'jelly-current']);
const MATERIAL = 'app/jelly-material.css';

describe('N3 — no perpetual CSS animation on the site tier without an owner', () => {
  const found = SHEETS.flatMap(perpetual);

  it('scans the site-tier sheets, including the jelly material', () => {
    expect(SHEETS.length).toBeGreaterThan(8);
    for (const f of ['app/globals.css', MATERIAL, 'app/jelly-arcs.css', 'components/radial/radial.css']) {
      expect(SHEETS).toContain(f);
    }
    expect(found.length).toBeGreaterThan(10);
  });

  it('every infinite animation is on the frozen baseline or is a sanctioned carrier', () => {
    const offenders = found
      .filter((p) => !(SANCTIONED.has(p.name) && p.file === MATERIAL))
      .filter((p) => !BASELINE.has(`${p.file} :: ${p.name}`))
      .map((p) => `${p.file}: ${p.selector} { animation: ${p.name} … infinite }`);
    expect(
      offenders,
      'A free-standing `infinite` keyframe never stops: not for a hidden tab, not offscreen, not under ' +
        '`jellyMotion = still`, not on a degraded tier — the page re-renders on every vsync (frame-budget --gate). ' +
        'Ambient motion belongs to the jelly services (lib/jelly, docs/plasmatic-jelly-system.md). If this is a ' +
        'loader, end it with the load; if it is decoration, make it a one-shot.',
    ).toEqual([]);
  });

  it('the carrier keyframes run only on spans inside .jelly-flow', () => {
    const carriers = found.filter((p) => SANCTIONED.has(p.name));
    expect(carriers.map((p) => p.name).sort()).toEqual([...SANCTIONED].sort());
    for (const p of carriers) {
      expect(p.file).toBe(MATERIAL);
      expect(p.selector, `${p.name} is declared outside the carrier`).toMatch(/^\.jelly-flow\s*>/);
    }
  });

  it('the baseline stays honest (it only shrinks)', () => {
    const live = new Set(found.map((p) => `${p.file} :: ${p.name}`));
    const stale = [...BASELINE.keys()].filter((k) => !live.has(k));
    expect(stale, 'These no longer loop — remove them from BASELINE.').toEqual([]);
  });

  describe('the carrier stops wherever the material does', () => {
    const css = read(MATERIAL);
    const all = rules(css);
    /** `display: none` on `.jelly-flow` from a rule whose selector mentions `root`. */
    const hides = (root: RegExp) =>
      all.some(
        ({ selector, body }) =>
          root.test(selector) && /\.jelly-flow\b/.test(selector) && /display\s*:\s*none/.test(body),
      );

    it.each([
      ...DEGRADED_ROOT_SELECTOR.split(',').map((s) => s.trim()),
      '.app-high-contrast',
    ])('killed under %s', (root) => {
      expect(hides(new RegExp(root.replace(/[.[\]]/g, '\\$&')))).toBe(true);
    });

    it('killed under reduced transparency, forced colours and print', () => {
      for (const q of ['prefers-reduced-transparency: reduce', 'forced-colors: active', 'print']) {
        const block = [...css.matchAll(/@media([^{]+)\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)].find(
          (m) => m[1].includes(q) && /\.jelly-flow[\s\S]*?display\s*:\s*none/.test(m[2]),
        );
        expect(block, q).toBeDefined();
      }
    });

    it.each([
      ['scrolling', 'html[data-scrolling]'],
      ['jellyMotion = still (WCAG 2.2.2)', "html[data-jelly-motion='still']"],
      ['a game in play (R16)', "html[data-game-state='playing']"],
    ])('paused while %s', (_label, root) => {
      const paused = all.some(
        ({ selector, body }) =>
          selector.split(',').some((s) => s.trim().startsWith(root) && /\.jelly-flow/.test(s)) &&
          /animation-play-state\s*:\s*paused/.test(body),
      );
      expect(paused).toBe(true);
    });
  });
});

describe('N12 — nothing jelly paints at z ≥ 0 inside a host', () => {
  const sheets = ['app/liquid-glass.css', MATERIAL].map((f) => ({ f, all: rules(read(f)) }));
  const layer = (cls: string) =>
    sheets.flatMap(({ f, all }) =>
      all
        .filter(({ selector }) => selector.split(',').some((s) => s.trim() === cls))
        .map((r) => ({ f, ...r })),
    );

  it.each(['.jelly-flow', '.jelly-haze-canvas', '.liquid-glass-canvas', '.liquid-light'])(
    '%s declares a negative z-index',
    (cls) => {
      const decls = layer(cls)
        .map((r) => /(?:^|;)\s*z-index\s*:\s*([^;]+)/.exec(r.body)?.[1]?.trim())
        .filter(Boolean) as string[];
      expect(decls.length, `${cls} must declare its z-index`).toBeGreaterThan(0);
      for (const z of decls) expect(Number(z), `${cls} z-index ${z}`).toBeLessThan(0);
    },
  );

  it('the hosts that carry those layers are isolated', () => {
    const iso = sheets.flatMap(({ all }) =>
      all.filter(({ body }) => /isolation\s*:\s*isolate/.test(body)).map((r) => r.selector),
    );
    for (const host of [
      "[data-liquid-canvas='on']",
      "[data-jelly-flow='on']",
      "[data-jelly-haze='on']",
    ]) {
      expect(iso.some((s) => s.includes(host)), `${host} must be isolated`).toBe(true);
    }
  });

  it('the arc layer is the one body-level exception: click-through, on the named token', () => {
    const arc = rules(read('app/jelly-arcs.css')).find(({ selector }) => selector === '.jelly-arc-layer');
    expect(arc).toBeDefined();
    expect(arc!.body).toMatch(/pointer-events\s*:\s*none/);
    expect(arc!.body).toMatch(/z-index\s*:\s*var\(--z-arcs\)/);
    expect(arc!.body).toMatch(/position\s*:\s*fixed/);
  });
});
