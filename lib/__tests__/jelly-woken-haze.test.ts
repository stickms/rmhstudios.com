/**
 * Woken haze (CSS-first jelly, PR 2; spec docs/superpowers/specs/2026-11-07-css-first-jelly-design.md §2).
 *
 * The haze no longer moves on its own. A transform-only layer on each glass role's own `::after` (no node injected by
 * JavaScript) carries NO animation at rest — not even a paused one, which Blink still counts as a current transform
 * animation and promotes to its own compositor layer — and gets `animation` only while its host is hovered or holds
 * focus, starting from the identity frame (no phase delay). Since Task 11 it has no box at rest either (`display:
 * none`): a box only while woken, faded in from 0. `still` and no-hover devices get no motion; `calm` is
 * slower (`--jelly-tempo`) and fainter (`--jelly-amp`). These are CSS-text assertions, like the N3 gate in
 * site-infinite-animation.test.ts.
 *
 * Pseudo-element survey (why `::after`): `[data-evert]::before` is the eversion state layer, and `lib/evert-auto.ts`
 * adopts any control whose `::before` is free, so `::before` is taken on every interactive host. `::after` is used on
 * a role host only by `[data-evert~='select']` (the nav rail, not a role) and `.touch-target` (coarse pointers), both
 * excluded below. `.glass-inset` is not positioned (fields are mostly replaced `<input>`s with no pseudo-elements at
 * all), so it keeps the static floor only.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GLOBE_SELECTOR, OPT_OUT_SCOPE_SELECTOR, OPT_OUT_SELECTOR } from '@/lib/jelly/tiers';
import { readCss } from './css-source';

const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const flat = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
const CSS = strip(readCss(join(ROOT, 'app/jelly-material.css')));

/** Innermost `selector { body }` pairs, with the at-rule preludes that wrap them. */
interface Rule {
  selectors: string[];
  body: string;
  at: string[];
}
/** Split on top-level commas only (selector lists nest inside `:is()` / `:not()`). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map(flat);
}
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(flat(buf));
      buf = '';
    } else if (ch === '}') {
      const sel = stack.pop() ?? '';
      if (buf.trim() && !sel.startsWith('@')) {
        out.push({
          selectors: splitTop(sel),
          body: buf,
          at: stack.filter((s) => s.startsWith('@')),
        });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}
const ALL = rules(CSS);
const decl = (body: string, prop: string) =>
  new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim().replace(/\s+/g, ' ');

/** The host compound's prefix: off native-material routes. */
const PREFIX = 'html:not(.native-material) ';
/** The base layer rule: the one single-selector `::after` rule under the prefix that generates the box. */
const BASE = ALL.find(
  (r) =>
    r.selectors.length === 1 &&
    r.selectors[0].startsWith(PREFIX) &&
    r.selectors[0].endsWith('::after') &&
    decl(r.body, 'content') === "''",
);
const LAYER = BASE?.selectors[0] ?? '';
/** The host compound the layer hangs on (the base selector without its prefix and pseudo-element). */
const HOST = LAYER.startsWith(PREFIX) ? LAYER.slice(PREFIX.length, -'::after'.length) : '';
/**
 * Hover, or keyboard focus inside the host (`:has(:focus-visible)`), never a mouse click's leftover focus: with
 * `:focus-within`, a clicked button kept the drift running on every role around it until focus moved (25 compositor
 * layers on /jelly instead of 10). The host's own keyboard focus pauses the haze (§6), so it does not wake it either.
 */
const WAKE = [`${PREFIX}${HOST}:hover::after`, `${PREFIX}${HOST}:has(:focus-visible)::after`];
/** Every rule, in any layer or at-rule, that targets the haze layer in some state. */
const HAZE_RULES = ALL.filter((r) =>
  r.selectors.some((s) => HOST !== '' && s.includes(HOST) && s.endsWith('::after')),
);
/** The animation this rule attaches, if any (`animation: none` attaches nothing). */
const attaches = (body: string) => {
  const a = decl(body, 'animation');
  return (a !== undefined && a !== 'none') || decl(body, 'animation-name') !== undefined;
};

describe('the woken haze layer', () => {
  it('is one ::after rule, scoped off native-material routes', () => {
    expect(
      BASE,
      'a ::after rule generating the haze layer in app/jelly-material.css',
    ).toBeDefined();
    expect(BASE!.selectors).toHaveLength(1);
    expect(LAYER.startsWith(PREFIX)).toBe(true);
    expect(HOST).not.toBe('');
  });

  it.each([
    '.glass-fill',
    '.glass-pane',
    '.glass-chrome',
    '.glass-overlay',
    "[data-slot='button']",
  ])('hangs on %s', (role) => {
    expect(HOST).toContain(role);
  });

  it('skips ghost and link buttons (they carry no material at rest)', () => {
    expect(HOST).toContain(
      "[data-slot='button']:not([data-variant='ghost'], [data-variant='link'])",
    );
  });

  it('is a paint layer under the text: absolute, inert, at a negative z-index', () => {
    const body = BASE!.body;
    expect(decl(body, 'content')).toBe("''");
    expect(decl(body, 'position')).toBe('absolute');
    expect(decl(body, 'inset')).toBe('0');
    expect(decl(body, 'border-radius')).toBe('inherit');
    expect(decl(body, 'pointer-events')).toBe('none');
    expect(Number(decl(body, 'z-index'))).toBeLessThan(0);
  });

  /**
   * Task 11 (cross-engine profiling, 2026-11-08): a resting layer with five gradients on every host, even with no
   * animation, was re-rasterised on every scroll frame by Firefox's WebRender on a software rasteriser (/jelly scroll
   * 58 → 5 fps at p95). So at rest the layer has no box at all: `display: none` in the base rule, a box only under the
   * wake selectors, faded in from 0 by `@starting-style` and out by a discrete `display` transition.
   */
  it('paints nothing at rest: no box until woken, faded in from 0', () => {
    expect(decl(BASE!.body, 'display'), 'the resting layer has no box').toBe('none');
    const boxed = HAZE_RULES.filter((r) => {
      const d = decl(r.body, 'display');
      return d !== undefined && !/^none\b/.test(d);
    });
    expect(
      boxed.map((r) => r.selectors.join(', ')),
      'only the wake rule gives the layer a box',
    ).toHaveLength(1);
    expect([...boxed[0].selectors].sort()).toEqual([...WAKE].sort());
    expect(boxed[0].at.some((a) => a.startsWith('@starting-style'))).toBe(false);
    const enter = HAZE_RULES.filter((r) => r.at.some((a) => a.startsWith('@starting-style')));
    expect(enter.length, 'an @starting-style rule fades the woken layer in').toBe(1);
    expect([...enter[0].selectors].sort()).toEqual([...WAKE].sort());
    expect(decl(enter[0].body, 'opacity')).toBe('0');
    expect(decl(BASE!.body, 'transition')).toMatch(/\bdisplay\b.*\ballow-discrete\b/);
  });

  it('carries no animation at rest, in any layer or at-rule (not even a paused one)', () => {
    expect(HAZE_RULES.length).toBeGreaterThan(5);
    const resting = HAZE_RULES.filter(
      (r) => attaches(r.body) && !r.selectors.every((s) => WAKE.includes(s)),
    );
    expect(
      resting.map((r) => r.selectors.join(', ')),
      'A paused transform animation still promotes the layer in Blink: attach animation only on wake.',
    ).toEqual([]);
    expect(decl(BASE!.body, 'animation')).toBeUndefined();
    expect(decl(BASE!.body, 'animation-play-state')).toBeUndefined();
  });

  it('attaches the drift only under :hover and keyboard focus inside the host', () => {
    const woken = HAZE_RULES.filter((r) => attaches(r.body));
    expect(woken).toHaveLength(1);
    expect([...woken[0].selectors].sort()).toEqual([...WAKE].sort());
    expect(decl(woken[0].body, 'animation')).toMatch(/^jelly-drift\b.*\binfinite\b/);
  });

  it('wakes from the identity frame: no phase delay anywhere', () => {
    const wake = HAZE_RULES.find((r) => attaches(r.body))!;
    expect(decl(wake.body, 'animation-delay')).toBeUndefined();
    expect(wake.body).not.toMatch(/--jelly-phase/);
    expect(CSS, 'nothing sets a per-host phase').not.toMatch(/--jelly-phase\s*:/);
    // The resting box has no transform, so the drift's first frame must be that same identity: no snap on wake.
    expect(CSS).toMatch(/@keyframes\s+jelly-drift\s*\{\s*0%\s*\{\s*transform:\s*none;\s*\}/);
  });

  it('calm is slower and fainter: duration over --jelly-tempo, opacity over --jelly-amp', () => {
    const wake = HAZE_RULES.find((r) => attaches(r.body))!;
    expect(decl(BASE!.body, '--jelly-drift-dur')).toMatch(/var\(--jelly-tempo, 1\)/);
    expect(decl(wake.body, 'animation')).toMatch(/var\(--jelly-drift-dur\)/);
    // The resting layer has no box (opacity 0, the fade's end); the woken one is the one calm makes fainter.
    expect(decl(wake.body, 'opacity')).toMatch(/var\(--jelly-amp, 1\)/);
  });

  it('has no scroll-driven variant (it would hold a running animation on every card)', () => {
    expect(CSS).not.toMatch(/animation-timeline/);
    expect(CSS).not.toMatch(/@supports\s*\(\s*animation-timeline/);
  });

  it('the host is isolated, so the negative layer resolves inside it', () => {
    const host = ALL.find((r) => r.selectors.length === 1 && r.selectors[0] === `${PREFIX}${HOST}`);
    expect(host, 'a host rule with the layer selector minus ::after').toBeDefined();
    expect(decl(host!.body, 'isolation')).toBe('isolate');
  });

  it('honours every per-element and subtree opt-out the jelly services honour', () => {
    const globe = new Set(GLOBE_SELECTOR.split(','));
    const own = OPT_OUT_SELECTOR.split(',').filter((s) => !globe.has(s));
    const scopes = OPT_OUT_SCOPE_SELECTOR.split(',');
    const quote = (s: string) => s.replace(/"/g, "'");
    for (const s of [
      ...own,
      "[data-jelly='lite']",
      "[data-jelly-flow='off']",
      "[data-jelly='none']",
    ])
      expect(HOST, s).toContain(quote(s));
    for (const s of [...scopes, '.slice-theme', '.slice-tokens', '.stm-legacy'])
      expect(HOST, `${s} subtree`).toMatch(
        new RegExp(`:is\\([^)]*${quote(s).replace(/[.[\]()]/g, '\\$&')}[^)]*\\) \\*`),
      );
    // `::after` is already used on these: the nav rail's selection layer and the coarse-pointer hit area.
    expect(HOST).toContain("[data-evert~='select']");
    expect(HOST).toContain('.touch-target');
    expect(HOST).toContain('.hit-slop');
  });
});

describe('where the haze does not move', () => {
  const layerRules = (pred: (r: Rule) => boolean) => ALL.filter(pred);

  it("html[data-jelly-motion='still'] removes the animation", () => {
    const hit = layerRules(
      (r) =>
        r.selectors.includes(`html[data-jelly-motion='still'] ${HOST}::after`) &&
        decl(r.body, 'animation') === 'none',
    );
    expect(hit).toHaveLength(1);
  });

  it('a @media (hover: none) block disables it (touch: the static floor, no motion)', () => {
    const hit = layerRules(
      (r) =>
        r.at.some((a) => a.startsWith('@media') && a.includes('(hover: none)')) &&
        r.selectors.includes(`${HOST}::after`) &&
        decl(r.body, 'animation') === 'none',
    );
    expect(hit).toHaveLength(1);
    // The handheld tier (the exact query from handheld-tier.test.ts) shares the block.
    expect(hit[0].at.join(' ')).toContain('(pointer: coarse) and (max-width: 1024px)');
  });

  it.each([
    ['scrolling', `html[data-scrolling] ${HOST}::after`],
    ['a game in play', `html[data-game-state='playing'] ${HOST}::after`],
    ['its own keyboard focus (a ring over a moving ground)', `${HOST}:focus-visible::after`],
  ])('pauses while %s', (_label, sel) => {
    const hit = layerRules(
      (r) =>
        r.at.length === 0 &&
        r.selectors.includes(sel) &&
        /animation-play-state\s*:\s*paused/.test(r.body),
    );
    expect(hit.length).toBeGreaterThan(0);
  });

  it.each([
    ['app high contrast', '.app-high-contrast '],
    ['an in-play HUD', "html[data-game-state='playing'] [data-jelly-zone='hud'] "],
  ])('is removed under %s', (_label, root) => {
    const hit = layerRules(
      (r) => r.selectors.includes(`${root}${HOST}::after`) && /display\s*:\s*none/.test(r.body),
    );
    expect(hit.length).toBeGreaterThan(0);
  });

  it('is removed in print', () => {
    const hit = layerRules(
      (r) =>
        r.at.some((a) => a.startsWith('@media') && a.includes('print')) &&
        r.selectors.includes(`${HOST}::after`) &&
        /display\s*:\s*none/.test(r.body),
    );
    expect(hit.length).toBeGreaterThan(0);
  });
});

describe('the keyframes it reuses', () => {
  it.each(['jelly-drift'])('%s animates transform only', (name) => {
    const block = new RegExp(`@keyframes\\s+${name}\\s*\\{((?:[^{}]*\\{[^{}]*\\})+)\\s*\\}`).exec(
      CSS,
    );
    expect(block, name).toBeTruthy();
    const props = [...block![1].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(props.length).toBeGreaterThan(0);
    expect(new Set(props)).toEqual(new Set(['transform']));
  });
});
