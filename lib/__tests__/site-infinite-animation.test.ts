/**
 * Ambient motion has no owner left, and the list of what still loops only shrinks (gate N3; generalises
 * `static-backdrop.test.ts`; Steel R5: nothing moves at rest).
 *
 * Every `infinite` animation in the site-tier stylesheets (`app/*.css`, `components/{ui,radial,feed,site}/**`) is on the
 * frozen, justified {@link BASELINE} (loaders, skeletons, live dots, all on transient or tiny elements) or the test
 * fails. The one sanctioned keyframe the Plasmatic Jelly material owned (`jelly-drift`, the woken haze), and its
 * pause, print, high-contrast and `still` cases (N3 haze half), and gate N12 (the haze sits under the text), went
 * with the material in Steel phase 1: nothing of it is left to pin.
 *
 * The baseline only shrinks: an entry that no longer matches fails "the baseline stays honest".
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCss } from './css-source';

const ROOT = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (file: string) => strip(readCss(join(ROOT, file)));

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
]
  // A split entry sheet (`radial.css` + `radial/*.css`, redesign E4) is scanned once, through its entry: `read`
  // inlines the partials, so listing them too would count every rule twice under a second file name.
  .filter((f) => !existsSync(join(ROOT, `${f.slice(0, f.lastIndexOf('/'))}.css`)))
  .sort();

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
    const named = decls.map((d) => /^\s*animation-name\s*:\s*([\w-]+)/.exec(d)?.[1]).find(Boolean);
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
  [
    'app/globals.css :: pulse',
    'Tailwind `animate-pulse-slow` theme token: loading placeholders only',
  ],
  [
    'app/globals.css :: rainbow-shift',
    'cosmetic name-colour effect on a purchased username, text-sized',
  ],
  ['app/globals.css :: glitch', 'cosmetic name effect on a purchased username, text-sized'],
  [
    'app/globals.css :: dr-float',
    'Dream Rift landing title float (its game landing, not a surface)',
  ],
  [
    'app/globals.css :: dr-title-glow',
    'Dream Rift landing title glow (its game landing, not a surface)',
  ],
  ['components/radial/radial.css :: radial-pulse-soft', 'unread / live dots, a few px'],
  [
    'components/radial/radial.css :: globe-armed',
    'the reticle while a hold is armed (hub or docked globe) — only while the pointer is down on a full ring',
  ],
  [
    'components/radial/eversion/eversion.css :: evert-popup-turn',
    'eversion popup spinner, while a navigation runs',
  ],
  ['components/feed/feed.css :: feed-live-pulse', 'the live indicator dot on a live item'],
]);

describe('N3 — no perpetual CSS animation on the site tier without an owner', () => {
  const found = SHEETS.flatMap(perpetual);

  it('scans the site-tier sheets', () => {
    expect(SHEETS.length).toBeGreaterThan(5);
    for (const f of ['app/globals.css', 'components/radial/radial.css']) {
      expect(SHEETS).toContain(f);
    }
    expect(found.length).toBeGreaterThan(10);
  });

  it('every infinite animation is on the frozen baseline', () => {
    const offenders = found
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

  it('the baseline stays honest (it only shrinks)', () => {
    const live = new Set(found.map((p) => `${p.file} :: ${p.name}`));
    const stale = [...BASELINE.keys()].filter((k) => !live.has(k));
    expect(stale, 'These no longer loop — remove them from BASELINE.').toEqual([]);
  });
});
